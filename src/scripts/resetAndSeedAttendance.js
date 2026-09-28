/**
 * Reset Attendance: delete legacy data, seed fresh current-month AttendanceDay
 * -----------------------------------------------------------------------------
 * One-shot cleanup + reseed for a school that's moved to the single-collection
 * attendance model:
 *
 *   1. Deletes ALL old AttendanceSession + AttendanceRecord documents for this
 *      school (the two-collection model is fully superseded — nothing in the
 *      app reads them anymore) and any leftover legacy-shaped AttendanceAudit
 *      rows (the ones still carrying the old `attendanceRecordId` field).
 *   2. Wipes this school/academic-year's CURRENT MONTH of AttendanceDay data
 *      (and its matching audit rows), then reseeds it fresh — identical logic
 *      to seedCurrentMonthAttendance.js.
 *
 * Data outside the current month in the NEW AttendanceDay collection (e.g. a
 * previous run's earlier months) is left untouched — only step 1's legacy
 * collections are wiped unconditionally; step 2 is scoped to this month only,
 * same safety boundary as seedCurrentMonthAttendance.js.
 *
 * Usage (from devel/back):
 *   node src/scripts/resetAndSeedAttendance.js [schoolId]
 *
 * schoolId is optional — defaults to the first School document found.
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('dotenv').config();

const School = require('../models/School');
const AcademicYear = require('../models/AcademicYear');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const AttendanceDay = require('../models/AttendanceDay');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceAudit = require('../models/AttendanceAudit');
const AttendanceStatus = require('../models/AttendanceStatus');
const Holiday = require('../models/Holiday');

const STATUS_WEIGHTS = { PRESENT: 86, LATE: 5, ABSENT: 6, EXCUSED: 2, LEAVE: 1 };

function buildWeightedPool(statuses) {
  const pool = [];
  statuses.forEach((s) => {
    const weight = STATUS_WEIGHTS[s.code] ?? (s.countsAsPresent ? 80 : 5);
    for (let i = 0; i < weight; i++) pool.push(s);
  });
  return pool;
}

function pickStatus(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

const REMARKS_BY_CODE = {
  ABSENT: ['Sick leave', 'Family emergency', 'No reason given', ''],
  LATE: ['Traffic delay', 'Overslept', 'Bus delay', ''],
  EXCUSED: ['Medical appointment', 'School event', ''],
  LEAVE: ['Approved leave', ''],
};

function remarksFor(status) {
  const options = REMARKS_BY_CODE[status.code];
  if (!options) return '';
  return options[Math.floor(Math.random() * options.length)];
}

function currentMonthWeekdays() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = now.getDate();
  const dates = [];
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(Date.UTC(year, month, day));
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip Sat/Sun
    dates.push(d);
  }
  return dates;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
  return { start, end };
}

async function deleteLegacyCollections(schoolId) {
  const [recordsDeleted, sessionsDeleted, legacyAuditsDeleted] = await Promise.all([
    AttendanceRecord.deleteMany({ schoolId }).then((r) => r.deletedCount || 0),
    AttendanceSession.deleteMany({ schoolId }).then((r) => r.deletedCount || 0),
    AttendanceAudit.deleteMany({ schoolId, attendanceRecordId: { $exists: true } }).then((r) => r.deletedCount || 0),
  ]);
  console.log(`Deleted legacy data — AttendanceSession: ${sessionsDeleted}, AttendanceRecord: ${recordsDeleted}, legacy-shaped AttendanceAudit: ${legacyAuditsDeleted}`);
}

async function deleteCurrentMonthAttendanceDay(schoolId, academicYearId, start, end) {
  const dayFilter = { schoolId, academicYearId, date: { $gte: start, $lte: end } };
  const days = await AttendanceDay.find(dayFilter).select('_id').lean();
  const dayIds = days.map((d) => d._id);

  let auditsDeleted = 0;
  if (dayIds.length > 0) {
    const result = await AttendanceAudit.deleteMany({ schoolId, attendanceDayId: { $in: dayIds } });
    auditsDeleted = result.deletedCount || 0;
  }

  const dayResult = await AttendanceDay.deleteMany(dayFilter);
  console.log(`Deleted this month's existing AttendanceDay data — docs: ${dayResult.deletedCount || 0}, audit entries: ${auditsDeleted}\n`);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const schoolIdArg = process.argv[2];
  const school = schoolIdArg ? await School.findById(schoolIdArg) : await School.findOne();
  if (!school) {
    console.error('No school found (pass a schoolId as the first argument if you have more than one).');
    process.exit(1);
  }
  const schoolId = school._id;
  console.log(`School: ${school.name || schoolId}\n`);

  console.log('--- Step 1: Delete legacy AttendanceSession/AttendanceRecord data ---');
  await deleteLegacyCollections(schoolId);
  console.log('');

  const academicYear =
    (await AcademicYear.findOne({ schoolId, isCurrent: true })) ||
    (await AcademicYear.findOne({ schoolId }).sort({ startDate: -1 }));
  if (!academicYear) {
    console.error('No academic year found for this school.');
    process.exit(1);
  }
  console.log(`Academic Year: ${academicYear.name || academicYear._id}`);

  console.log('\n--- Step 2: Reset + reseed this month\'s AttendanceDay data ---');
  const { start: monthStart, end: monthEnd } = currentMonthRange();
  console.log(`Deleting existing AttendanceDay data between ${monthStart.toISOString().split('T')[0]} and ${monthEnd.toISOString().split('T')[0]}...`);
  await deleteCurrentMonthAttendanceDay(schoolId, academicYear._id, monthStart, monthEnd);

  const statuses = await AttendanceStatus.find({ schoolId, status: 'ACTIVE' });
  if (!statuses.length) {
    console.error('No active AttendanceStatus records found for this school — seed statuses first.');
    process.exit(1);
  }
  const weightedPool = buildWeightedPool(statuses);

  const sections = await Section.find({ schoolId, status: { $ne: 'ARCHIVED' } }).lean();
  if (!sections.length) {
    console.error('No sections found for this school.');
    process.exit(1);
  }

  const enrollments = await Enrollment.find({
    schoolId,
    academicYearId: academicYear._id,
    status: { $ne: 'ARCHIVED' },
  }).lean();

  if (enrollments.length === 0) {
    console.error(`No enrollments found for academicYearId ${academicYear._id} — nothing to seed.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const enrollmentsBySection = new Map();
  enrollments.forEach((e) => {
    const key = String(e.sectionId);
    if (!enrollmentsBySection.has(key)) enrollmentsBySection.set(key, []);
    enrollmentsBySection.get(key).push(e);
  });

  const holidays = await Holiday.find({ schoolId, status: 'ACTIVE' }).lean();
  const holidayDates = new Set(holidays.map((h) => h.date));

  const dates = currentMonthWeekdays();
  console.log(`Date range: ${dates[0]?.toISOString().split('T')[0]} to ${dates[dates.length - 1]?.toISOString().split('T')[0]} (${dates.length} school weekdays)`);
  console.log(`Sections: ${sections.length}, Enrolled students: ${enrollments.length}\n`);

  let daysUpserted = 0;
  let sectionsWithNoStudents = 0;

  for (const section of sections) {
    const sectionEnrollments = enrollmentsBySection.get(String(section._id)) || [];
    if (sectionEnrollments.length === 0) {
      sectionsWithNoStudents++;
      continue;
    }

    for (const date of dates) {
      const dateStr = date.toISOString().split('T')[0];
      if (holidayDates.has(dateStr)) continue;

      const bulkOps = sectionEnrollments.map((enrollment) => {
        const chosenStatus = pickStatus(weightedPool);
        return {
          updateOne: {
            filter: { schoolId, studentId: enrollment.studentId, date, academicYearId: academicYear._id },
            update: {
              $setOnInsert: {
                schoolId,
                academicYearId: academicYear._id,
                date,
                attendanceType: 'DAILY',
                studentId: enrollment.studentId,
                enrollmentId: enrollment._id,
                gradeId: section.gradeId,
                sectionId: section._id,
              },
              $set: {
                periods: [{
                  periodId: null,
                  statusId: chosenStatus._id,
                  remarks: remarksFor(chosenStatus),
                  markedAt: date,
                  source: 'BULK',
                  sessionStatus: 'SUBMITTED',
                }],
              },
            },
            upsert: true,
          },
        };
      });

      if (bulkOps.length > 0) {
        const result = await AttendanceDay.bulkWrite(bulkOps, { ordered: false });
        daysUpserted += (result.upsertedCount || 0) + (result.modifiedCount || 0);
      }
    }

    console.log(`Section "${section.name}": ${sectionEnrollments.length} students x ${dates.length} days seeded`);
  }

  console.log('\nDone.');
  console.log(`AttendanceDay documents created/updated: ${daysUpserted}`);
  if (sectionsWithNoStudents > 0) {
    console.log(`Sections skipped (no enrolled students): ${sectionsWithNoStudents}`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Reset + seed failed:', err);
  process.exit(1);
});
