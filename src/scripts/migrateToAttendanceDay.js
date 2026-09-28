/**
 * Migrate: AttendanceSession + AttendanceRecord -> single AttendanceDay
 * -------------------------------------------------------------------
 * Consolidates the old two-collection attendance model into one
 * AttendanceDay document per (schoolId, studentId, date), with a `periods`
 * array. Also rewrites AttendanceAudit rows to reference the new
 * (attendanceDayId, periodEntryId) instead of the old attendanceRecordId.
 *
 * SAFE BY DEFAULT: runs in dry-run/report-only mode unless --commit is
 * passed. Dry-run does every grouping/conflict-detection step and prints a
 * full report, but writes nothing. Review that report before re-running
 * with --commit.
 *
 * Usage (from devel/back):
 *   node src/scripts/migrateToAttendanceDay.js              # dry run
 *   node src/scripts/migrateToAttendanceDay.js --commit      # writes data
 *   node src/scripts/migrateToAttendanceDay.js --commit --schoolId=<id>
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('dotenv').config();

const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceAudit = require('../models/AttendanceAudit');
const AttendanceDay = require('../models/AttendanceDay');

const COMMIT = process.argv.includes('--commit');
const schoolIdArg = process.argv.find((a) => a.startsWith('--schoolId='));
const filterSchoolId = schoolIdArg ? schoolIdArg.split('=')[1] : null;

const dayKey = (schoolId, studentId, date) =>
  `${schoolId}|${studentId}|${new Date(date).toISOString().split('T')[0]}`;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');
  console.log(COMMIT ? '*** COMMIT MODE — this will write data ***' : '(dry run — no changes will be written)');
  console.log('');

  const recordFilter = filterSchoolId ? { schoolId: filterSchoolId } : {};
  const sessionFilter = filterSchoolId ? { schoolId: filterSchoolId } : {};

  const [records, sessions] = await Promise.all([
    AttendanceRecord.find(recordFilter).lean(),
    AttendanceSession.find(sessionFilter).lean(),
  ]);
  console.log(`Source: ${sessions.length} AttendanceSession docs, ${records.length} AttendanceRecord docs.`);

  const sessionById = new Map(sessions.map((s) => [String(s._id), s]));

  // --- Group records by (schoolId, studentId, calendar day) ---
  const groups = new Map();
  for (const record of records) {
    const key = dayKey(record.schoolId, record.studentId, record.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  console.log(`Grouped into ${groups.size} student-day documents.`);
  console.log('');

  // --- Build AttendanceDay docs + track conflicts ---
  const dayDocs = [];
  const oldRecordToNew = new Map(); // old AttendanceRecord._id (string) -> { dayId, periodEntryId }
  let orphanRecords = 0;
  let sectionConflicts = 0;
  let gradeConflicts = 0;
  const conflictSamples = [];

  for (const [key, groupRecords] of groups) {
    // Resolve conflicting sectionId/gradeId within a group by latest markedAt wins.
    const sorted = [...groupRecords].sort(
      (a, b) => new Date(b.markedAt || b.date) - new Date(a.markedAt || a.date)
    );
    const canonical = sorted[0];
    const distinctSections = new Set(groupRecords.map((r) => String(r.sectionId)));
    const distinctGrades = new Set(groupRecords.map((r) => String(r.gradeId)));
    if (distinctSections.size > 1) {
      sectionConflicts++;
      if (conflictSamples.length < 10) {
        conflictSamples.push(`sectionId conflict for key=${key}: ${[...distinctSections].join(', ')} -> using ${canonical.sectionId} (latest markedAt)`);
      }
    }
    if (distinctGrades.size > 1) {
      gradeConflicts++;
      if (conflictSamples.length < 10) {
        conflictSamples.push(`gradeId conflict for key=${key}: ${[...distinctGrades].join(', ')} -> using ${canonical.gradeId} (latest markedAt)`);
      }
    }

    let attendanceType = 'DAILY';
    const periods = [];
    for (const record of groupRecords) {
      const session = sessionById.get(String(record.attendanceSessionId));
      if (!session) orphanRecords++;
      if (session?.attendanceType === 'PERIOD') attendanceType = 'PERIOD';

      const periodEntry = {
        periodId: session?.periodId || record.periodId || null,
        subjectId: session?.subjectId || null,
        teacherId: session?.teacherId || null,
        statusId: record.statusId,
        remarks: record.remarks || '',
        markedBy: record.markedBy || null,
        markedAt: record.markedAt || record.createdAt || new Date(),
        source: record.source || 'MANUAL',
        sessionStatus: session?.status || 'SUBMITTED',
      };
      periods.push({ entry: periodEntry, oldRecordId: String(record._id) });
    }

    const dayDoc = new AttendanceDay({
      schoolId: canonical.schoolId,
      academicYearId: canonical.academicYearId,
      date: canonical.date,
      attendanceType,
      studentId: canonical.studentId,
      enrollmentId: canonical.enrollmentId,
      gradeId: canonical.gradeId,
      sectionId: canonical.sectionId,
      periods: periods.map((p) => p.entry),
      createdAt: canonical.createdAt,
      updatedAt: canonical.updatedAt,
    });

    periods.forEach((p, i) => {
      oldRecordToNew.set(p.oldRecordId, { dayId: dayDoc._id, periodEntryId: dayDoc.periods[i]._id });
    });

    dayDocs.push(dayDoc);
  }

  console.log('--- Conflict report ---');
  console.log(`Orphan records (parent session not found, defaulted to DAILY/no period): ${orphanRecords}`);
  console.log(`Student-days with a sectionId conflict across records: ${sectionConflicts}`);
  console.log(`Student-days with a gradeId conflict across records: ${gradeConflicts}`);
  conflictSamples.forEach((line) => console.log(`  - ${line}`));
  console.log('');

  // --- Reconciliation checks ---
  const totalPeriodsBuilt = dayDocs.reduce((sum, d) => sum + d.periods.length, 0);
  console.log('--- Reconciliation ---');
  console.log(`AttendanceDay docs to create: ${dayDocs.length}`);
  console.log(`Total period entries across all docs: ${totalPeriodsBuilt} (source records: ${records.length}) -> ${totalPeriodsBuilt === records.length ? 'MATCH' : 'MISMATCH'}`);
  console.log('');

  if (!COMMIT) {
    console.log('Dry run complete. Re-run with --commit to write this data.');
    await mongoose.disconnect();
    return;
  }

  // --- Commit: insert AttendanceDay docs in batches ---
  const BATCH_SIZE = 1000;
  let inserted = 0;
  for (let i = 0; i < dayDocs.length; i += BATCH_SIZE) {
    const batch = dayDocs.slice(i, i + BATCH_SIZE);
    await AttendanceDay.insertMany(batch, { ordered: false });
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${dayDocs.length} AttendanceDay docs...`);
  }

  // --- Migrate AttendanceAudit rows ---
  const auditFilter = filterSchoolId ? { schoolId: filterSchoolId } : {};
  const audits = await AttendanceAudit.find(auditFilter).lean();
  console.log(`\nMigrating ${audits.length} AttendanceAudit rows...`);

  let auditMigrated = 0;
  let auditSkipped = 0;
  const newAuditDocs = [];
  for (const audit of audits) {
    const mapped = oldRecordToNew.get(String(audit.attendanceRecordId));
    if (!mapped) {
      auditSkipped++;
      continue;
    }
    newAuditDocs.push({
      schoolId: audit.schoolId,
      attendanceDayId: mapped.dayId,
      periodEntryId: mapped.periodEntryId,
      previousStatusId: audit.previousStatusId,
      newStatusId: audit.newStatusId,
      reason: audit.reason,
      editedBy: audit.editedBy,
      timestamp: audit.timestamp,
      ipAddress: audit.ipAddress,
      requestId: audit.requestId,
      createdAt: audit.createdAt,
      updatedAt: audit.updatedAt,
    });
    auditMigrated++;
  }

  // Replace AttendanceAudit contents with the migrated shape. Only within
  // the scope of this migration (filterSchoolId, if given) — a full-school
  // run replaces the whole collection.
  if (newAuditDocs.length > 0) {
    if (filterSchoolId) {
      await AttendanceAudit.deleteMany({ schoolId: filterSchoolId, attendanceRecordId: { $exists: true } });
    } else {
      await AttendanceAudit.deleteMany({ attendanceRecordId: { $exists: true } });
    }
    await AttendanceAudit.insertMany(newAuditDocs, { ordered: false });
  }

  console.log(`AttendanceAudit migrated: ${auditMigrated}, skipped (no matching record): ${auditSkipped}`);
  console.log('\nMigration commit complete.');
  console.log('Old AttendanceSession/AttendanceRecord documents were NOT deleted — verify the new data first, then run the cleanup step separately.');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
