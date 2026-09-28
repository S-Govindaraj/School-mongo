/**
 * Seed Current Month Attendance (wipe + reseed) — single-collection model
 * ------------------------------------------------------------------------
 * Deletes every existing AttendanceDay document (and any AttendanceAudit
 * rows pointing at them) for THIS school + academic year that falls within
 * the current calendar month, then generates fresh, realistic,
 * combined-status attendance for every enrolled student in every section,
 * for every school weekday up to today (holidays are skipped).
 *
 * One AttendanceDay document per (student, date), each with a single DAILY
 * period entry (periodId: null) — matches the single-collection model
 * (src/models/AttendanceDay.js) the app itself reads and writes via
 * GET /attendance/roster and POST /attendance/mark-bulk. There is no
 * separate session document to create; marking IS the document.
 *
 * Deletion is scoped to schoolId + academicYearId + this month's date
 * range only — it never touches other schools or earlier/later months.
 *
 * Usage (from devel/back):
 *   node src/scripts/seedCurrentMonthAttendance.js [schoolId]
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
const AttendanceAudit = require('../models/AttendanceAudit');
const AttendanceStatus = require('../models/AttendanceStatus');
const Holiday = require('../models/Holiday');

// Realistic day-to-day mix rather than "everyone always present" — weights
// are per AttendanceStatus.code, applied to whatever statuses the school
// actually has configured (unrecognized codes fall back to a small weight
// keyed off countsAsPresent so a custom status set still works).
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

// Every school weekday (Mon-Fri) from the 1st of the current month through
// today, as UTC-midnight Date objects — matches how the app itself stores
// AttendanceDay's `date` field.
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

// Inclusive [start, end] covering the whole elapsed month-to-date — wider
// than currentMonthWeekdays() on purpose, so deletion also catches any
// stray weekend/holiday documents that may already exist in this range.
function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
  return { start, end };
}

async function deleteExistingMonthData(schoolId, academicYearId, start, end) {
  const dayFilter = { schoolId, academicYearId, date: { $gte: start, $lte: end } };
  const days = await AttendanceDay.find(dayFilter).select('_id').lean();
  const dayIds = days.map((d) => d._id);

  let auditsDeleted = 0;
  if (dayIds.length > 0) {
    const auditResult = await AttendanceAudit.deleteMany({ schoolId, attendanceDayId: { $in: dayIds } });
    auditsDeleted = auditResult.deletedCount || 0;
  }

  const dayResult = await AttendanceDay.deleteMany(dayFilter);
  const daysDeleted = dayResult.deletedCount || 0;

  console.log(`Deleted existing month data — AttendanceDay docs: ${daysDeleted}, audit entries: ${auditsDeleted}\n`);
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
  console.log(`School: ${school.name || schoolId}`);

  const academicYear =
    (await AcademicYear.findOne({ schoolId, isCurrent: true })) ||
    (await AcademicYear.findOne({ schoolId }).sort({ startDate: -1 }));
  if (!academicYear) {
    console.error('No academic year found for this school.');
    process.exit(1);
  }
  console.log(`Academic Year: ${academicYear.name || academicYear._id}`);

  const { start: monthStart, end: monthEnd } = currentMonthRange();
  console.log(`\nDeleting existing attendance for this school/academic-year between ${monthStart.toISOString().split('T')[0]} and ${monthEnd.toISOString().split('T')[0]}...`);
  await deleteExistingMonthData(schoolId, academicYear._id, monthStart, monthEnd);

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

  // Matches the same semantics the app's own GET /enrollments endpoint uses
  // (enrollmentController.js's getEnrollments): it never actually reads a
  // `status` query param at all and always queries `status: { $ne: 'ARCHIVED' }`.
  const enrollments = await Enrollment.find({
    schoolId,
    academicYearId: academicYear._id,
    status: { $ne: 'ARCHIVED' },
  }).lean();

  if (enrollments.length === 0) {
    const totalForSchool = await Enrollment.countDocuments({ schoolId });
    console.log(`\nNo enrollments matched {academicYearId: ${academicYear._id}}.`);
    console.log(`Total Enrollment documents for this school (any year): ${totalForSchool}`);
    if (totalForSchool > 0) {
      const yearCounts = await Enrollment.aggregate([
        { $match: { schoolId } },
        { $group: { _id: '$academicYearId', count: { $sum: 1 } } },
      ]);
      const years = await AcademicYear.find({ _id: { $in: yearCounts.map((y) => y._id) } }).select('name').lean();
      const yearNameById = new Map(years.map((y) => [String(y._id), y.name]));
      console.log('Academic-year breakdown:', yearCounts.map((y) => `${yearNameById.get(String(y._id)) || y._id}: ${y.count}`).join(', '));
      console.log('\nRe-run against the academic year shown above (pass the correct schoolId) once you know which one holds real enrollments.');
    } else {
      console.log('This school has no Enrollment documents at all — enroll students first, then re-run this script.');
    }
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
  console.error('Seeding failed:', err);
  process.exit(1);
});
