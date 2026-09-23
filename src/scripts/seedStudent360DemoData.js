/**
 * Seeds realistic, end-to-end demo data for ONE existing student so every
 * section of the Student 360 profile page (dev/src/pages/students/Student360Page.jsx
 * and its 14 tabs under dev/src/pages/students/student360/) renders real content
 * instead of empty states.
 *
 * This script is the Student 360 companion to seedPortalDemoData.js. It picks
 * the EXACT SAME demo student that script already picks (first ACTIVE student
 * sorted by admissionNumber), so running both scripts together builds one
 * coherent, fully-populated demo profile rather than two different
 * half-populated students. Every step finds-before-creates and is safe to run
 * multiple times, and it is safe to run BEFORE or AFTER seedPortalDemoData.js —
 * it never assumes the other script has or hasn't run yet.
 *
 * What it does, in order:
 *   1. Resolve School, current AcademicYear, and the demo Student + current
 *      Enrollment (same fallback query as seedPortalDemoData.js; creates a
 *      last-resort Student/Enrollment only if the school has none at all).
 *   2. AcademicHistory record closing out the CURRENT enrollment (promotion
 *      ledger entry, status ENROLLED since the year is still in progress).
 *   3. A PAST AcademicYear (immediately before the current one) + a PAST
 *      Enrollment (into the previous Grade when one exists) + a PAST
 *      AcademicHistory record (PROMOTED) — so the Academic Journey tab shows
 *      more than one year, and the Performance Trend chart has 2+ years of
 *      exam data to plot.
 *   4. ClassSubject rows for the student's current grade/year (3-4 subjects),
 *      find-or-create.
 *   5. AttendanceRecord top-up for the current year (only if seedPortalDemoData
 *      hasn't already seeded enough).
 *   6. ExamResult rows for the CURRENT year (top-up) and the PAST year (fresh)
 *      so the Performance Trend chart has a real multi-year trend.
 *   7. FeeConcession (APPROVED) for the current year, on top of whatever
 *      Invoices already exist.
 *   8. Timetable top-up for the current section (only if not already seeded).
 *   9. Guardian + StudentGuardian link (find-or-create, no new login).
 *  10. Document rows (generic Document model, ownerType STUDENT) — a couple
 *      VERIFIED, one PENDING_VERIFICATION so the Overview KPI is nonzero.
 *  11. Transport: minimal TransportRoute + RouteStop + Vehicle (find-or-create)
 *      and one ACTIVE TransportAssignment for the student.
 *  12. Timeline: one illustrative AuditLog entry (Timeline reads ANY AuditLog
 *      whose entityId equals this student's _id — normal admin browsing will
 *      populate the rest naturally via the Student 360 controller's own
 *      auditView() calls).
 *  13. Discipline: one minor, resolved DisciplineIncident + one completed
 *      DisciplinaryAction.
 *  14. Medical: one StudentHealthProfile + one routine MedicalVisit.
 *
 * Non-destructive: never deletes or overwrites unrelated existing data.
 *
 * Usage:
 *   node src/scripts/seedStudent360DemoData.js                  # apply
 *   node src/scripts/seedStudent360DemoData.js --dry-run         # preview only, writes nothing
 *   node src/scripts/seedStudent360DemoData.js --school=<id>     # target a specific School
 */
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

if (process.env.MONGODB_DNS_SERVERS) {
  const dnsServers = process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim());
  dns.setServers(dnsServers);
} else {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
  } catch (_) {}
}

async function connectToDatabase(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        autoIndex: false,
        serverSelectionTimeoutMS: 20000,
        maxPoolSize: 20,
        minPoolSize: 5,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 15000,
        heartbeatFrequencyMS: 10000,
      });
      console.log('Connected to MongoDB.');
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`  [warn] Database connection attempt ${attempt} failed: ${err.message}. Retrying in 3 seconds...`);
      try {
        if (dns.setDefaultResultOrder) {
          dns.setDefaultResultOrder('ipv4first');
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const School = require('../models/School');
const AcademicYear = require('../models/AcademicYear');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const AcademicHistory = require('../models/AcademicHistory');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const AttendanceStatus = require('../models/AttendanceStatus');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const ExamResult = require('../models/ExamResult');
const Invoice = require('../models/Invoice');
const FeeConcession = require('../models/FeeConcession');
const Timetable = require('../models/Timetable');
const Period = require('../models/Period');
const Staff = require('../models/Staff');
const TeacherAssignment = require('../models/TeacherAssignment');
const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const Document = require('../models/Document');
const TransportRoute = require('../models/TransportRoute');
const RouteStop = require('../models/RouteStop');
const Vehicle = require('../models/Vehicle');
const TransportAssignment = require('../models/TransportAssignment');
const AuditLog = require('../models/AuditLog');
const DisciplineIncident = require('../models/DisciplineIncident');
const DisciplinaryAction = require('../models/DisciplinaryAction');
const StudentHealthProfile = require('../models/StudentHealthProfile');
const MedicalVisit = require('../models/MedicalVisit');
const User = require('../models/User');

const DRY_RUN = process.argv.includes('--dry-run');
const schoolArg = process.argv.find((a) => a.startsWith('--school='));
const SCHOOL_ID_OVERRIDE = schoolArg ? schoolArg.split('=')[1] : null;

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

const log = (...args) => console.log(...args);

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const lastNWeekdays = (n) => {
  const dates = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (dates.length < n) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(new Date(d));
  }
  return dates.reverse();
};

// ---------------------------------------------------------------------------
// 1. School / AcademicYear / Student (same conventions as seedPortalDemoData.js)
// ---------------------------------------------------------------------------

async function resolveSchool() {
  if (SCHOOL_ID_OVERRIDE) {
    const school = await School.findById(SCHOOL_ID_OVERRIDE);
    if (!school) throw new Error(`--school=${SCHOOL_ID_OVERRIDE} not found`);
    return school;
  }
  const school = await School.findOne().sort({ createdAt: 1 });
  if (!school) {
    throw new Error('No School document found. Run the main seed script first (npm run seed) or pass --school=<id>.');
  }
  return school;
}

async function resolveCurrentAcademicYear(schoolId) {
  let ay = await AcademicYear.findOne({ schoolId, isCurrent: true });
  if (!ay) ay = await AcademicYear.findOne({ schoolId }).sort({ startDate: -1 });
  if (!ay) {
    throw new Error('No AcademicYear found for this school. Seed academic years first (e.g. npm run seed).');
  }
  return ay;
}

// Reuses the EXACT SAME fallback query seedPortalDemoData.js uses, so both
// scripts operate on the same demo student.
async function pickDemoStudent(school, academicYear) {
  console.log('\n--- Step: Pick Demo Student (same student as seedPortalDemoData.js) ---');

  let student = await Student.findOne({ schoolId: school._id, status: 'ACTIVE' }).sort({ admissionNumber: 1 });

  // Resolve a real active Section and its corresponding Grade in the school
  let targetSection = await Section.findOne({ schoolId: school._id, status: 'ACTIVE' }).populate('gradeId');
  let targetGrade = targetSection && targetSection.gradeId ? targetSection.gradeId : null;

  if (!targetGrade) {
    targetGrade = await Grade.findOne({ schoolId: school._id, status: 'ACTIVE' }).sort({ sequenceOrder: 1 })
      || await Grade.findOne({ schoolId: school._id }).sort({ sequenceOrder: 1 });
  }
  if (!targetSection && targetGrade) {
    targetSection = await Section.findOne({ schoolId: school._id, gradeId: targetGrade._id, status: 'ACTIVE' })
      || await Section.findOne({ schoolId: school._id, gradeId: targetGrade._id });
  }
  if (!targetSection) {
    targetSection = await Section.findOne({ schoolId: school._id, status: 'ACTIVE' })
      || await Section.findOne({ schoolId: school._id });
  }

  // If there are no grades or sections at all in the database, handle gracefully
  if (!targetGrade) {
    if (DRY_RUN) {
      targetGrade = { _id: new mongoose.Types.ObjectId(), name: 'Grade 1' };
    } else {
      targetGrade = await Grade.create({
        schoolId: school._id,
        name: 'Grade 1',
        code: 'G1',
        sequenceOrder: 1,
        status: 'ACTIVE',
      });
      log(`  [create] Default Grade created: ${targetGrade.name}`);
    }
  }

  if (!targetSection) {
    if (DRY_RUN) {
      targetSection = { _id: new mongoose.Types.ObjectId(), name: 'Section A', gradeId: targetGrade._id };
    } else {
      targetSection = await Section.create({
        schoolId: school._id,
        gradeId: targetGrade._id,
        name: 'Section A',
        code: 'A',
        capacity: 40,
        status: 'ACTIVE',
      });
      log(`  [create] Default Section created: ${targetSection.name}`);
    }
  }

  if (!student) {
    log('  No ACTIVE Student found in this school.');
    if (DRY_RUN) {
      log('  [dry-run] would create a minimal last-resort demo Student + Enrollment.');
      student = {
        _id: new mongoose.Types.ObjectId(),
        schoolId: school._id,
        studentNumber: 'STU-DEMO-001',
        admissionNumber: 'ADM-DEMO-001',
        firstName: 'Demo',
        lastName: 'Student',
        gender: 'MALE',
        status: 'ACTIVE',
        emergencyContact: { name: 'Demo Guardian', relationship: 'FATHER', phone: '+91 90000 00000' },
      };
      const enrollment = {
        _id: new mongoose.Types.ObjectId(),
        schoolId: school._id,
        studentId: student._id,
        academicYearId: academicYear,
        gradeId: targetGrade,
        sectionId: targetSection,
        enrollmentDate: new Date(),
        status: 'ACTIVE',
        isCurrent: true,
      };
      log(`Demo student selected: ${student.firstName} ${student.lastName} (Admission# ${student.admissionNumber}), Grade ${targetGrade.name} / Section ${targetSection.name}`);
      return { student, enrollment };
    }

    student = await Student.create({
      schoolId: school._id,
      studentNumber: `STU-DEMO-${Date.now().toString().slice(-6)}`,
      admissionNumber: `ADM-DEMO-${Date.now().toString().slice(-6)}`,
      firstName: 'Demo',
      lastName: 'Student',
      dob: new Date('2013-05-15'),
      gender: 'MALE',
      status: 'ACTIVE',
      admissionDate: new Date(),
      emergencyContact: { name: 'Demo Guardian', relationship: 'FATHER', phone: '+91 90000 00000' },
    });
    log(`  [create] Last-resort demo Student created: ${student.firstName} ${student.lastName}`);

    const enr = await Enrollment.create({
      schoolId: school._id,
      studentId: student._id,
      academicYearId: academicYear._id,
      gradeId: targetGrade._id,
      sectionId: targetSection._id,
      enrollmentDate: new Date(),
      status: 'ACTIVE',
      isCurrent: true,
    });
    const enrollment = await Enrollment.findById(enr._id).populate('gradeId').populate('sectionId');
    log(`  [create] Enrollment created into ${enrollment.gradeId?.name || targetGrade.name} / ${enrollment.sectionId?.name || targetSection.name}`);
    return { student, enrollment };
  }

  let enrollment = await Enrollment.findOne({ schoolId: school._id, studentId: student._id, isCurrent: true })
    .populate('gradeId')
    .populate('sectionId');

  // Check if enrollment is valid (both gradeId and sectionId successfully populated with a name)
  const isEnrollmentValid = enrollment && enrollment.gradeId && enrollment.gradeId.name && enrollment.sectionId && enrollment.sectionId.name;

  if (!isEnrollmentValid) {
    log(`  ${student.firstName} ${student.lastName} has no current Enrollment with a valid grade/section.`);

    if (DRY_RUN) {
      log(`  [dry-run] would link Enrollment for ${student.firstName} ${student.lastName} into ${targetGrade.name} / ${targetSection.name}`);
      enrollment = {
        _id: enrollment?._id || new mongoose.Types.ObjectId(),
        schoolId: school._id,
        studentId: student._id,
        academicYearId: academicYear,
        gradeId: targetGrade,
        sectionId: targetSection,
        enrollmentDate: new Date(),
        status: 'ACTIVE',
        isCurrent: true,
      };
    } else if (enrollment) {
      // Repair existing enrollment document that has broken/orphaned grade or section IDs
      enrollment.academicYearId = academicYear._id;
      enrollment.gradeId = targetGrade._id;
      enrollment.sectionId = targetSection._id;
      enrollment.status = 'ACTIVE';
      enrollment.isCurrent = true;
      await enrollment.save();
      enrollment = await Enrollment.findById(enrollment._id).populate('gradeId').populate('sectionId');
      log(`  [update] Repaired existing Enrollment linking ${student.firstName} ${student.lastName} to ${enrollment.gradeId?.name} / ${enrollment.sectionId?.name}`);
    } else {
      const created = await Enrollment.create({
        schoolId: school._id,
        studentId: student._id,
        academicYearId: academicYear._id,
        gradeId: targetGrade._id,
        sectionId: targetSection._id,
        enrollmentDate: new Date(),
        status: 'ACTIVE',
        isCurrent: true,
      });
      enrollment = await Enrollment.findById(created._id).populate('gradeId').populate('sectionId');
      log(`  [create] Enrollment created linking ${student.firstName} ${student.lastName} to ${enrollment.gradeId?.name} / ${enrollment.sectionId?.name}`);
    }
  } else {
    log(`  [reuse] Existing current Enrollment found: Grade ${enrollment.gradeId.name} / Section ${enrollment.sectionId.name}`);
  }

  const finalGradeName = enrollment.gradeId?.name || targetGrade?.name || 'N/A';
  const finalSectionName = enrollment.sectionId?.name || targetSection?.name || 'N/A';
  log(`Demo student selected: ${student.firstName} ${student.lastName} (Admission# ${student.admissionNumber}), Grade ${finalGradeName} / Section ${finalSectionName}`);
  return { student, enrollment };
}

// A real User to use for createdBy/approvedBy/recordedBy fields — the earliest
// created User in the school (typically the seeded admin login).
async function resolveAnchorUser(schoolId) {
  const user = await User.findOne({ schoolId }).sort({ createdAt: 1 });
  if (!user) log('  [warn] No User found in this school — some createdBy/approvedBy/recordedBy fields will be left unset.');
  return user;
}

// ---------------------------------------------------------------------------
// 2 & 3. Academic Journey: current AcademicHistory + a past year/enrollment
// ---------------------------------------------------------------------------

async function ensureAcademicHistory(school, enrollment, promotionStatus, remarks) {
  if (!enrollment || !enrollment._id) return null;
  const existing = await AcademicHistory.findOne({ schoolId: school._id, enrollmentId: enrollment._id });
  if (existing) {
    log(`  [reuse] AcademicHistory already exists for enrollment ${enrollment._id} (${existing.promotionStatus})`);
    return existing;
  }
  if (DRY_RUN) {
    log(`  [dry-run] would create AcademicHistory (${promotionStatus}) for enrollment ${enrollment._id}`);
    return null;
  }
  const history = await AcademicHistory.create({
    schoolId: school._id,
    studentId: enrollment.studentId,
    academicYearId: enrollment.academicYearId?._id || enrollment.academicYearId,
    gradeId: enrollment.gradeId?._id || enrollment.gradeId,
    sectionId: enrollment.sectionId?._id || enrollment.sectionId,
    enrollmentId: enrollment._id,
    promotionStatus,
    remarks,
  });
  log(`  [create] AcademicHistory created (${promotionStatus}) for enrollment ${enrollment._id}`);
  return history;
}

async function setupPastYearAndEnrollment(school, student, currentEnrollment, currentAcademicYear) {
  console.log('\n--- Step: Past Academic Year + Enrollment (for Academic Journey & Performance Trend) ---');

  const codeMatch = String(currentAcademicYear.code).match(/^(\d{4})-(\d{4})$/);
  if (!codeMatch) {
    log(`  [warn] Current AcademicYear code '${currentAcademicYear.code}' is not in the expected YYYY-YYYY format — skipping past-year seeding.`);
    return null;
  }
  const startYear = parseInt(codeMatch[1], 10);
  const pastCode = `${startYear - 1}-${startYear}`;

  let pastYear = await AcademicYear.findOne({ schoolId: school._id, code: pastCode });
  if (pastYear) {
    log(`  [reuse] Past AcademicYear ${pastCode} already exists`);
  } else if (DRY_RUN) {
    log(`  [dry-run] would create past AcademicYear ${pastCode}`);
    return null;
  } else {
    const pastStart = addDays(currentAcademicYear.startDate, -365);
    const pastEnd = addDays(currentAcademicYear.startDate, -1);
    pastYear = await AcademicYear.create({
      schoolId: school._id,
      name: pastCode,
      code: pastCode,
      startDate: pastStart,
      endDate: pastEnd,
      isCurrent: false,
      status: 'ARCHIVED',
    });
    log(`  [create] Past AcademicYear ${pastCode} created`);
  }

  if (!pastYear._id) return null; // dry-run borrowed object safety

  // Prefer the previous Grade in sequence (a real "last year, one grade lower"
  // record); fall back to the same grade/section if there is no lower grade
  // (e.g. student is already in the lowest grade).
  const currentGrade = currentEnrollment.gradeId;
  let pastGrade = null;
  let pastSection = null;
  if (currentGrade?.sequenceOrder > 1) {
    pastGrade = await Grade.findOne({ schoolId: school._id, sequenceOrder: currentGrade.sequenceOrder - 1 });
  }
  if (pastGrade) {
    pastSection = await Section.findOne({ schoolId: school._id, gradeId: pastGrade._id, status: 'ACTIVE' });
  }
  if (!pastGrade || !pastSection) {
    pastGrade = currentGrade;
    pastSection = currentEnrollment.sectionId;
  }

  let pastEnrollment = await Enrollment.findOne({ schoolId: school._id, studentId: student._id, academicYearId: pastYear._id })
    .populate('gradeId')
    .populate('sectionId');

  if (pastEnrollment) {
    log(`  [reuse] Past Enrollment already exists for ${pastYear.code}`);
  } else if (DRY_RUN) {
    log(`  [dry-run] would create past Enrollment into ${pastGrade?.name || 'Grade'} / ${pastSection?.name || 'Section'} (${pastYear.code})`);
    pastEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      schoolId: school._id,
      studentId: student._id,
      academicYearId: pastYear,
      gradeId: pastGrade,
      sectionId: pastSection,
      enrollmentDate: pastYear.startDate,
      status: 'PROMOTED',
      isCurrent: false,
    };
  } else {
    const created = await Enrollment.create({
      schoolId: school._id,
      studentId: student._id,
      academicYearId: pastYear._id,
      gradeId: pastGrade._id,
      sectionId: pastSection._id,
      enrollmentDate: pastYear.startDate,
      status: 'PROMOTED',
      isCurrent: false,
    });
    pastEnrollment = await Enrollment.findById(created._id).populate('gradeId').populate('sectionId');
    log(`  [create] Past Enrollment created into ${pastGrade.name} / ${pastSection.name} (${pastYear.code})`);
  }

  await ensureAcademicHistory(
    school,
    pastEnrollment,
    'PROMOTED',
    'Promoted to the next grade based on satisfactory academic performance and attendance.'
  );

  return { pastYear, pastEnrollment, pastGrade };
}

// ---------------------------------------------------------------------------
// 4. ClassSubject (find-or-create) + subject list resolution
// ---------------------------------------------------------------------------

async function ensureClassSubjects(school, academicYearId, gradeId) {
  console.log('\n--- Step: Class Subjects ---');
  let classSubjects = await ClassSubject.find({ schoolId: school._id, academicYearId, gradeId, status: 'ACTIVE' })
    .populate('subjectId')
    .limit(4);

  if (classSubjects.length > 0) {
    log(`  [reuse] ${classSubjects.length} ACTIVE ClassSubject row(s) already exist for this grade/year.`);
    return classSubjects.map((cs) => cs.subjectId).filter(Boolean);
  }

  const subjects = await Subject.find({ schoolId: school._id, status: 'ACTIVE' }).limit(4);
  if (subjects.length === 0) {
    log('  [warn] No ACTIVE Subjects found in this school — ClassSubject/ExamResult/Timetable seeding relying on subjects will be skipped.');
    return [];
  }

  if (DRY_RUN) {
    subjects.forEach((s) => log(`  [dry-run] would create ClassSubject for ${s.name}`));
    return subjects;
  }

  for (const subject of subjects) {
    const existing = await ClassSubject.findOne({ schoolId: school._id, academicYearId, gradeId, subjectId: subject._id });
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        await ClassSubject.findByIdAndUpdate(existing._id, { $set: { status: 'ACTIVE' } });
        log(`  [update] Reactivated ClassSubject for ${subject.name}`);
      } else {
        log(`  [reuse] ClassSubject already exists for ${subject.name}`);
      }
      continue;
    }
    await ClassSubject.create({
      schoolId: school._id,
      academicYearId,
      gradeId,
      subjectId: subject._id,
      isMandatory: true,
      isElective: false,
      weeklyPeriods: 5,
      passMarks: 35,
      maxMarks: 100,
      status: 'ACTIVE',
    });
    log(`  [create] ClassSubject created for ${subject.name}`);
  }

  return subjects;
}

// ---------------------------------------------------------------------------
// 5. Attendance top-up (current year only — mirrors seedPortalDemoData.js)
// ---------------------------------------------------------------------------

async function ensureAttendanceStatuses(school) {
  const defaults = {
    PRESENT: { name: 'Present', shortCode: 'P', countsAsPresent: true, countsAsAbsent: false, colorToken: 'emerald', sequence: 1 },
    ABSENT: { name: 'Absent', shortCode: 'A', countsAsPresent: false, countsAsAbsent: true, colorToken: 'rose', sequence: 2 },
    LATE: { name: 'Late Arrival', shortCode: 'L', countsAsPresent: true, countsAsAbsent: false, requiresReason: true, colorToken: 'amber', sequence: 3 },
  };
  const statusMap = {};
  for (const code of Object.keys(defaults)) {
    let doc = await AttendanceStatus.findOne({ schoolId: school._id, code });
    if (!doc && !DRY_RUN) {
      doc = await AttendanceStatus.create({ schoolId: school._id, code, status: 'ACTIVE', ...defaults[code] });
      log(`  [create] AttendanceStatus '${code}' created`);
    } else if (!doc) {
      log(`  [dry-run] would create AttendanceStatus '${code}'`);
      doc = { _id: null, code };
    } else {
      log(`  [reuse] AttendanceStatus '${code}' already exists`);
    }
    statusMap[code] = doc;
  }
  return statusMap;
}

async function topUpAttendance(school, enrollment, student) {
  console.log('\n--- Step: Attendance Records (top-up for current year) ---');
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;
  const existingCount = await AttendanceRecord.countDocuments({ schoolId: school._id, studentId: student._id, academicYearId });
  if (existingCount >= 10) {
    log(`  [reuse] ${existingCount} AttendanceRecord(s) already exist for the current year — leaving as is.`);
    return;
  }

  const statusMap = await ensureAttendanceStatuses(school);
  const gradeId = enrollment.gradeId?._id || enrollment.gradeId;
  const sectionId = enrollment.sectionId?._id || enrollment.sectionId;
  const dates = lastNWeekdays(18);

  let created = 0;
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const existingRecord = await AttendanceRecord.findOne({ schoolId: school._id, studentId: student._id, date });
    if (existingRecord) continue;

    const roll = i % 9;
    const statusCode = roll === 8 ? 'ABSENT' : roll === 4 ? 'LATE' : 'PRESENT';
    const statusDoc = statusMap[statusCode];
    if (DRY_RUN || !statusDoc._id) {
      log(`  [dry-run] would create AttendanceRecord for ${date.toDateString()} -> ${statusCode}`);
      continue;
    }

    let session = await AttendanceSession.findOne({ schoolId: school._id, sectionId, date, attendanceType: 'DAILY' });
    if (!session) {
      session = await AttendanceSession.create({
        schoolId: school._id,
        academicYearId,
        date,
        gradeId,
        sectionId,
        attendanceType: 'DAILY',
        status: 'SUBMITTED',
        startedAt: date,
        completedAt: date,
      });
    }

    try {
      await AttendanceRecord.create({
        schoolId: school._id,
        attendanceSessionId: session._id,
        academicYearId,
        studentId: student._id,
        enrollmentId: enrollment._id,
        gradeId,
        sectionId,
        date,
        statusId: statusDoc._id,
        markedAt: date,
        remarks: statusCode === 'LATE' ? 'Arrived a few minutes late' : statusCode === 'ABSENT' ? 'Informed in advance' : '',
        source: 'BULK',
      });
      created++;
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
  log(`  [create] ${created} AttendanceRecord(s) created.`);
}

// ---------------------------------------------------------------------------
// 6. Exam results (current-year top-up + fresh past-year rows)
// ---------------------------------------------------------------------------

async function ensureExamResults(school, enrollment, student, subjects, label) {
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;
  const existingCount = await ExamResult.countDocuments({ schoolId: school._id, studentId: student._id, academicYearId, status: 'PUBLISHED' });
  if (existingCount >= 3) {
    log(`  [reuse] ${existingCount} PUBLISHED ExamResult(s) already exist for ${label} — leaving as is.`);
    return;
  }
  if (!subjects || subjects.length === 0) {
    log(`  [skip] No subjects available — cannot seed ExamResult for ${label}.`);
    return;
  }

  const gradeId = enrollment.gradeId?._id || enrollment.gradeId;
  const sectionId = enrollment.sectionId?._id || enrollment.sectionId;

  const exams = [
    { examTitle: 'Unit Test 1', examType: 'UNIT_TEST', maxMarks: 50 },
    { examTitle: 'Mid-Term Assessment', examType: 'MID_TERM', maxMarks: 100 },
    { examTitle: 'Unit Test 2', examType: 'UNIT_TEST', maxMarks: 50 },
    { examTitle: 'Final Term Examination', examType: 'FINAL', maxMarks: 100 },
  ];

  let created = 0;
  for (let i = 0; i < exams.length; i++) {
    const subject = subjects[i % subjects.length];
    const exam = exams[i];
    const existing = await ExamResult.findOne({
      schoolId: school._id,
      studentId: student._id,
      academicYearId,
      subjectId: subject._id,
      examTitle: exam.examTitle,
    });
    if (existing) continue;

    const percentage = 68 + ((i * 6) % 28);
    const totalObtained = Math.round((percentage / 100) * exam.maxMarks);
    const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : 'C';

    if (DRY_RUN) {
      log(`  [dry-run] would create ExamResult '${exam.examTitle}' for ${subject.name} (${label}, ${percentage}%)`);
      continue;
    }

    await ExamResult.create({
      schoolId: school._id,
      studentId: student._id,
      academicYearId,
      gradeId,
      sectionId,
      subjectId: subject._id,
      examTitle: exam.examTitle,
      examType: exam.examType,
      maxMarks: exam.maxMarks,
      totalObtained,
      percentage,
      grade,
      remarks: percentage >= 85 ? 'Excellent performance' : 'Good effort, keep improving',
      status: 'PUBLISHED',
      publishedAt: enrollment.enrollmentDate || new Date(),
    });
    created++;
  }
  log(`  [create] ${created} ExamResult(s) created for ${label}.`);
}

// ---------------------------------------------------------------------------
// 7. Fee Concession
// ---------------------------------------------------------------------------

async function ensureFeeConcession(school, enrollment, student, anchorUser) {
  console.log('\n--- Step: Fee Concession ---');
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;
  const existing = await FeeConcession.findOne({ schoolId: school._id, studentId: student._id, academicYearId });
  if (existing) {
    log(`  [reuse] FeeConcession already exists for this student/year (${existing.name}).`);
    return;
  }
  if (DRY_RUN) {
    log('  [dry-run] would create FeeConcession "Merit Scholarship" (PERCENTAGE, 15%, APPROVED)');
    return;
  }
  await FeeConcession.create({
    schoolId: school._id,
    studentId: student._id,
    academicYearId,
    name: 'Merit Scholarship',
    code: 'MERIT15',
    type: 'PERCENTAGE',
    value: 15,
    validFrom: enrollment.enrollmentDate || new Date(),
    reason: 'Awarded for academic excellence in the previous academic year.',
    status: 'APPROVED',
    createdBy: anchorUser?._id,
    approvedBy: anchorUser?._id,
  });
  log('  [create] FeeConcession "Merit Scholarship" created (PERCENTAGE, 15%, APPROVED).');
}

// ---------------------------------------------------------------------------
// 8. Timetable top-up
// ---------------------------------------------------------------------------

async function topUpTimetable(school, enrollment, subjects) {
  console.log('\n--- Step: Timetable (top-up) ---');
  const gradeId = enrollment.gradeId?._id || enrollment.gradeId;
  const sectionId = enrollment.sectionId?._id || enrollment.sectionId;
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;

  const existingCount = await Timetable.countDocuments({ schoolId: school._id, gradeId, sectionId, status: 'ACTIVE' });
  if (existingCount >= 5) {
    log(`  [reuse] ${existingCount} ACTIVE Timetable entries already exist — leaving as is.`);
    return;
  }
  if (!subjects || subjects.length === 0) {
    log('  [skip] No subjects available — cannot seed Timetable.');
    return;
  }

  const teacherAssignment = await TeacherAssignment.findOne({ schoolId: school._id, academicYearId, gradeId, sectionId, status: 'ACTIVE' });
  let teacherId = teacherAssignment?.staffId;
  if (!teacherId) {
    const teachingStaff = await Staff.findOne({ schoolId: school._id, isTeachingStaff: true, status: 'ACTIVE' });
    teacherId = teachingStaff?._id;
  }
  if (!teacherId && DRY_RUN) {
    teacherId = new mongoose.Types.ObjectId();
  }
  if (!teacherId) {
    log('  [skip] No ACTIVE TeacherAssignment or teaching Staff found — cannot seed Timetable.');
    return;
  }

  const periods = await Period.find({ schoolId: school._id, status: 'ACTIVE', type: 'INSTRUCTIONAL' }).sort({ sequence: 1 }).limit(6);
  if (periods.length === 0) {
    log('  [warn] No ACTIVE INSTRUCTIONAL Periods found — cannot seed Timetable.');
    return;
  }

  let created = 0;
  for (const day of DAYS) {
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      const subject = subjects[i % subjects.length];
      const existing = await Timetable.findOne({ schoolId: school._id, academicYearId, sectionId, dayOfWeek: day, periodId: period._id, status: 'ACTIVE' });
      if (existing) continue;
      if (DRY_RUN) {
        log(`  [dry-run] would create Timetable entry ${day} ${period.name} -> ${subject.name}`);
        continue;
      }
      try {
        await Timetable.create({
          schoolId: school._id,
          academicYearId,
          gradeId,
          sectionId,
          dayOfWeek: day,
          periodId: period._id,
          subjectId: subject._id,
          teacherId,
          roomNumber: 'Room 101',
          status: 'ACTIVE',
          source: 'MANUAL',
        });
        created++;
      } catch (e) {
        if (e.code === 11000) {
          log(`  [skip] Timetable slot ${day} ${period.name} conflicts with an existing booking — skipped.`);
        } else {
          throw e;
        }
      }
    }
  }
  log(`  [create] ${created} Timetable entries created.`);
}

// ---------------------------------------------------------------------------
// 9. Guardian (find-or-create, no login)
// ---------------------------------------------------------------------------

async function ensureGuardian(school, student) {
  console.log('\n--- Step: Guardian ---');
  let link = await StudentGuardian.findOne({ schoolId: school._id, studentId: student._id }).populate('guardianId');
  if (link && link.guardianId) {
    log(`  [reuse] Guardian already linked: ${link.guardianId.name}`);
    return;
  }
  if (DRY_RUN) {
    log('  [dry-run] would create Guardian + StudentGuardian link');
    return;
  }
  const relationship = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'].includes(student.emergencyContact?.relationship)
    ? student.emergencyContact.relationship
    : 'FATHER';
  const name = student.emergencyContact?.name || `${student.firstName} Guardian`;
  const guardian = await Guardian.create({
    schoolId: school._id,
    name,
    relationship,
    phone: student.emergencyContact?.phone || student.phone || '+91 90000 00000',
    email: `parent.demo.${student.admissionNumber}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@schoolerp.com',
    occupation: 'Parent',
    address: [student.address?.street, student.address?.city].filter(Boolean).join(', '),
    isPrimary: true,
    isEmergencyContact: true,
    status: 'ACTIVE',
  });
  await StudentGuardian.create({
    schoolId: school._id,
    studentId: student._id,
    guardianId: guardian._id,
    relationship,
    isPrimary: true,
    isEmergencyContact: true,
  });
  log(`  [create] Guardian created and linked: ${guardian.name}`);
}

// ---------------------------------------------------------------------------
// 10. Documents
// ---------------------------------------------------------------------------

async function ensureDocuments(school, student, anchorUser) {
  console.log('\n--- Step: Documents ---');
  const existingCount = await Document.countDocuments({ schoolId: school._id, ownerType: 'STUDENT', ownerId: student._id });
  if (existingCount >= 2) {
    log(`  [reuse] ${existingCount} Document(s) already exist for this student — leaving as is.`);
    return;
  }

  const docs = [
    {
      documentType: 'BIRTH_CERTIFICATE',
      title: 'Birth Certificate',
      fileName: 'birth-certificate.pdf',
      status: 'VERIFIED',
    },
    {
      documentType: 'TRANSFER_CERTIFICATE',
      title: 'Previous School Transfer Certificate',
      fileName: 'transfer-certificate.pdf',
      status: 'VERIFIED',
    },
    {
      documentType: 'ADDRESS_PROOF',
      title: 'Address Proof',
      fileName: 'address-proof.pdf',
      status: 'PENDING_VERIFICATION',
    },
  ];

  let created = 0;
  for (const spec of docs) {
    const existing = await Document.findOne({ schoolId: school._id, ownerType: 'STUDENT', ownerId: student._id, title: spec.title });
    if (existing) continue;
    if (DRY_RUN) {
      log(`  [dry-run] would create Document '${spec.title}' (${spec.status})`);
      continue;
    }
    await Document.create({
      schoolId: school._id,
      ownerType: 'STUDENT',
      ownerId: student._id,
      documentType: spec.documentType,
      title: spec.title,
      fileName: spec.fileName,
      originalFileName: spec.fileName,
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: 245760,
      storageKey: `demo/students/${student._id}/${spec.fileName}`,
      storageProvider: 'LOCAL',
      checksum: `demo-${student._id}-${spec.fileName}`,
      version: 1,
      status: spec.status,
      visibility: 'RESTRICTED',
      uploadedBy: anchorUser?._id,
      verifiedBy: spec.status === 'VERIFIED' ? anchorUser?._id : undefined,
      verifiedAt: spec.status === 'VERIFIED' ? new Date() : undefined,
    });
    created++;
    log(`  [create] Document '${spec.title}' created (${spec.status}).`);
  }
  log(`  [create] ${created} Document(s) created.`);
}

// ---------------------------------------------------------------------------
// 11. Transport
// ---------------------------------------------------------------------------

async function ensureTransport(school, student, enrollment) {
  console.log('\n--- Step: Transport ---');
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;

  const existingAssignment = await TransportAssignment.findOne({ schoolId: school._id, studentId: student._id, status: 'ACTIVE' });
  if (existingAssignment) {
    log('  [reuse] Active TransportAssignment already exists for this student.');
    return;
  }

  let route = await TransportRoute.findOne({ schoolId: school._id, status: 'ACTIVE' });
  let vehicle = await Vehicle.findOne({ schoolId: school._id, status: 'ACTIVE' });
  let stop = route ? await RouteStop.findOne({ schoolId: school._id, routeId: route._id, status: 'ACTIVE' }) : null;

  if (DRY_RUN) {
    if (!route) log('  [dry-run] would create TransportRoute "Route 1"');
    if (!vehicle) log('  [dry-run] would create Vehicle');
    if (!stop) log('  [dry-run] would create RouteStop');
    log('  [dry-run] would create TransportAssignment for the demo student');
    return;
  }

  if (!vehicle) {
    vehicle = await Vehicle.create({
      schoolId: school._id,
      vehicleNumber: 'BUS-DEMO-01',
      registrationNumber: `DEMO-${Date.now().toString().slice(-6)}`,
      vehicleType: 'BUS',
      capacity: 40,
      status: 'ACTIVE',
    });
    log('  [create] Vehicle created (BUS-DEMO-01).');
  } else {
    log('  [reuse] ACTIVE Vehicle already exists.');
  }

  if (!route) {
    route = await TransportRoute.create({
      schoolId: school._id,
      academicYearId,
      routeCode: `RT-DEMO-${Date.now().toString().slice(-6)}`,
      routeName: 'Demo Route 1',
      direction: 'BOTH',
      estimatedDurationMinutes: 45,
      assignedVehicleId: vehicle._id,
      status: 'ACTIVE',
    });
    log('  [create] TransportRoute created (Demo Route 1).');
  } else {
    log('  [reuse] ACTIVE TransportRoute already exists.');
  }

  if (!stop) {
    stop = await RouteStop.findOne({ schoolId: school._id, routeId: route._id, status: 'ACTIVE' });
  }
  if (!stop) {
    stop = await RouteStop.create({
      schoolId: school._id,
      routeId: route._id,
      stopCode: 'STOP-01',
      stopName: 'School Gate Stop',
      sequence: 1,
      estimatedArrivalTime: '07:30',
      estimatedDepartureTime: '07:35',
      monthlyFare: 800,
      status: 'ACTIVE',
    });
    log('  [create] RouteStop created (School Gate Stop).');
  } else {
    log('  [reuse] ACTIVE RouteStop already exists.');
  }

  await TransportAssignment.create({
    schoolId: school._id,
    academicYearId,
    studentId: student._id,
    enrollmentId: enrollment._id,
    routeId: route._id,
    routeStopId: stop._id,
    vehicleId: vehicle._id,
    pickupRequired: true,
    dropRequired: true,
    effectiveFrom: enrollment.enrollmentDate || new Date(),
    status: 'ACTIVE',
    remarks: 'Demo transport assignment for Student 360 seeding.',
  });
  log('  [create] TransportAssignment created for the demo student.');
}

// ---------------------------------------------------------------------------
// 12. Timeline — one illustrative AuditLog entry
// ---------------------------------------------------------------------------

async function ensureTimelineEntry(school, student) {
  console.log('\n--- Step: Timeline (illustrative AuditLog entry) ---');
  const existing = await AuditLog.findOne({ schoolId: school._id, entityId: String(student._id), entity: 'Student' });
  if (existing) {
    log('  [reuse] An AuditLog entry for this student already exists.');
    return;
  }
  if (DRY_RUN) {
    log('  [dry-run] would create one illustrative AuditLog entry (Student profile note).');
    return;
  }
  await AuditLog.create({
    schoolId: school._id,
    actorName: 'System Seed',
    action: 'UPDATE',
    entity: 'Student',
    entityId: String(student._id),
    reason: 'Demo data seeded for Student 360 profile.',
    details: { seededBy: 'seedStudent360DemoData.js' },
  });
  log('  [create] Illustrative AuditLog entry created.');
}

// ---------------------------------------------------------------------------
// 13. Discipline
// ---------------------------------------------------------------------------

async function ensureDiscipline(school, student, anchorUser) {
  console.log('\n--- Step: Discipline ---');
  const existing = await DisciplineIncident.findOne({ schoolId: school._id, studentId: student._id });
  if (existing) {
    log('  [reuse] A DisciplineIncident already exists for this student.');
    return;
  }

  let reporter = await Staff.findOne({ schoolId: school._id, isTeachingStaff: true, status: 'ACTIVE' }).sort({ _id: 1 });
  if (!reporter) {
    reporter = await Staff.findOne({ schoolId: school._id, status: 'ACTIVE' }).sort({ _id: 1 });
  }
  if (DRY_RUN) {
    log('  [dry-run] would create a minor, resolved DisciplineIncident + DisciplinaryAction.');
    return;
  }
  if (!reporter) {
    log('  [warn] No ACTIVE Staff found in school — DisciplineIncident reportedBy will be unset.');
  }

  const incidentDate = addDays(new Date(), -20).toISOString().slice(0, 10);
  const incident = await DisciplineIncident.create({
    schoolId: school._id,
    studentId: student._id,
    date: incidentDate,
    category: 'BEHAVIORAL',
    severity: 'LOW',
    description: 'Late submission of homework on two occasions during the term.',
    reportedBy: reporter._id,
    status: 'RESOLVED',
  });
  log('  [create] DisciplineIncident created (minor, resolved).');

  await DisciplinaryAction.create({
    schoolId: school._id,
    incidentId: incident._id,
    actionType: 'WARNING',
    actionDate: incidentDate,
    reason: 'Late submission of homework',
    notes: 'Verbal warning issued and resolved; no further action required.',
    approvedBy: anchorUser?._id,
    status: 'COMPLETED',
  });
  log('  [create] DisciplinaryAction created (verbal warning, completed).');
}

// ---------------------------------------------------------------------------
// 14. Medical
// ---------------------------------------------------------------------------

async function ensureMedical(school, student, anchorUser) {
  console.log('\n--- Step: Medical ---');

  let profile = await StudentHealthProfile.findOne({ schoolId: school._id, studentId: student._id });
  if (profile) {
    log('  [reuse] StudentHealthProfile already exists.');
  } else if (DRY_RUN) {
    log('  [dry-run] would create StudentHealthProfile.');
  } else {
    profile = await StudentHealthProfile.create({
      schoolId: school._id,
      studentId: student._id,
      bloodGroup: 'O+',
      allergies: ['Pollen'],
      chronicConditions: [],
      emergencyNotes: 'No known chronic conditions. Carries an antihistamine for seasonal allergies.',
      medicalAlerts: [],
      doctorName: 'Dr. Anitha Rao',
      doctorPhone: '+91 98000 12345',
    });
    log('  [create] StudentHealthProfile created.');
  }

  const existingVisits = await MedicalVisit.countDocuments({ schoolId: school._id, studentId: student._id });
  if (existingVisits > 0) {
    log(`  [reuse] ${existingVisits} MedicalVisit(s) already exist — leaving as is.`);
    return;
  }
  if (DRY_RUN) {
    log('  [dry-run] would create one routine MedicalVisit.');
    return;
  }
  await MedicalVisit.create({
    schoolId: school._id,
    studentId: student._id,
    visitDate: addDays(new Date(), -30).toISOString().slice(0, 10),
    reason: 'Routine annual health checkup',
    symptoms: 'None',
    observation: 'Height, weight and vision within normal range for age.',
    actionTaken: 'No treatment required. Recommended annual follow-up.',
    recordedBy: anchorUser?._id,
  });
  log('  [create] MedicalVisit created (routine checkup).');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  try {
    console.log(`\nStudent 360 Demo Data Seeder ${DRY_RUN ? '(DRY RUN — no writes will be made)' : ''}`);
    await connectToDatabase();

    const school = await resolveSchool();
    console.log(`School: ${school.name} (${school._id})`);
    const academicYear = await resolveCurrentAcademicYear(school._id);
    console.log(`Academic Year (current): ${academicYear.name} (${academicYear._id})`);

    const { student, enrollment } = await pickDemoStudent(school, academicYear);
    const anchorUser = await resolveAnchorUser(school._id);

    await ensureAcademicHistory(school, enrollment, 'ENROLLED', 'Currently enrolled — academic year in progress.');
    const pastYearInfo = await setupPastYearAndEnrollment(school, student, enrollment, academicYear);

    const subjects = await ensureClassSubjects(school, enrollment.academicYearId?._id || enrollment.academicYearId, enrollment.gradeId?._id || enrollment.gradeId);

    await topUpAttendance(school, enrollment, student);

    await ensureExamResults(school, enrollment, student, subjects, 'the current year');
    if (pastYearInfo?.pastEnrollment) {
      await ensureExamResults(school, pastYearInfo.pastEnrollment, student, subjects, 'the past year');
    }

    await ensureFeeConcession(school, enrollment, student, anchorUser);

    await topUpTimetable(school, enrollment, subjects);

    await ensureGuardian(school, student);

    await ensureDocuments(school, student, anchorUser);

    await ensureTransport(school, student, enrollment);

    await ensureTimelineEntry(school, student);

    await ensureDiscipline(school, student, anchorUser);

    await ensureMedical(school, student, anchorUser);

    console.log('\n================ SUMMARY ================');
    console.log(`Student: ${student.firstName} ${student.lastName} (Admission# ${student.admissionNumber})`);
    console.log(`         _id: ${student._id}`);
    console.log(`Current Grade/Section: ${enrollment.gradeId?.name || 'N/A'} / ${enrollment.sectionId?.name || 'N/A'} (${academicYear.name})`);
    if (pastYearInfo?.pastYear) {
      console.log(`Past Academic Year seeded: ${pastYearInfo.pastYear.name}`);
    }
    console.log('\nOpen this student\'s profile at /students/<id>/360 (or via the Students directory) to see');
    console.log('every Student 360 tab populated: Overview, Academic Journey, Subjects & Teachers, Attendance,');
    console.log('Exams & Results (+ Performance Trend across 2 years), Finance, Timetable, Guardians, Documents,');
    console.log('Transport, Timeline, Discipline and Medical.');
    console.log('===========================================');
    console.log(`\nDone.${DRY_RUN ? ' Re-run without --dry-run to apply these changes.' : ''}`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
