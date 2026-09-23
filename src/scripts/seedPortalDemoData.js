/**
 * Seeds realistic, end-to-end demo data for ONE existing student so every
 * section of the Student Portal, Teacher Portal and Parent Portal pages
 * (dev/src/pages/portals/{Student,Teacher,Parent}PortalPage.jsx) renders
 * real content instead of empty states.
 *
 * Why this is needed: portalStudentController.js, portalTeacherController.js
 * and portalParentController.js already have correct fallback logic (first
 * ACTIVE student / first ACTIVE teaching staff / first 2 ACTIVE students
 * when the logged-in user has no explicit Student/Staff/Guardian link) — the
 * dashboards look empty only because AttendanceRecord, Timetable, ExamResult,
 * Announcement, TeacherAssignment, Invoice and Payment have no rows yet for
 * that fallback student/section.
 *
 * What it does, in order (every step finds-before-creates, so it is safe to
 * run multiple times without duplicating students/guardians/teachers/
 * invoices/etc.):
 *   1. Resolve School (first one, or --school=<id>) and AcademicYear.
 *   2. Pick a demo Student — reuses the EXACT same fallback query the
 *      controllers themselves use (first ACTIVE student sorted by
 *      admissionNumber), so this is the same student an admin/unlinked
 *      login already previews. Falls back to creating one minimal
 *      Student + Enrollment only if the school has none at all.
 *   3. Guardian + a Parent Portal login (User, role PARENT).
 *   4. Teaching Staff + a Teacher Portal login (User, role TEACHER) +
 *      TeacherAssignment(s) into the demo student's grade/section.
 *   5. A Mon–Fri Timetable for that grade/section using existing INSTRUCTIONAL
 *      Periods.
 *   6. ~18 AttendanceRecord rows across the last ~3-4 weeks (weekdays only).
 *   7. A few PUBLISHED ExamResult rows.
 *   8. A few PUBLISHED, school-wide Announcements.
 *   9. Two Invoices (one PAID, one PARTIALLY_PAID) + a matching Payment.
 *  10. Prints a summary with the exact login email/password for the
 *      Guardian's and Teacher's User accounts.
 *
 * Non-destructive: never deletes or overwrites unrelated existing data.
 * Every write is guarded by a find-before-create (or upsert-style)
 * check, so re-running this script is safe.
 *
 * Usage:
 *   node src/scripts/seedPortalDemoData.js                  # apply
 *   node src/scripts/seedPortalDemoData.js --dry-run         # preview only, writes nothing
 *   node src/scripts/seedPortalDemoData.js --school=<id>     # target a specific School
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const User = require('../models/User');
const Role = require('../models/Role');
const Staff = require('../models/Staff');
const TeacherAssignment = require('../models/TeacherAssignment');
const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const Period = require('../models/Period');
const Timetable = require('../models/Timetable');
const AttendanceStatus = require('../models/AttendanceStatus');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const ExamResult = require('../models/ExamResult');
const Announcement = require('../models/Announcement');
const FeeCategory = require('../models/FeeCategory');
const Invoice = require('../models/Invoice');
const InvoiceItem = require('../models/InvoiceItem');
const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');

const DRY_RUN = process.argv.includes('--dry-run');
const schoolArg = process.argv.find((a) => a.startsWith('--school='));
const SCHOOL_ID_OVERRIDE = schoolArg ? schoolArg.split('=')[1] : null;

const DEMO_PASSWORD = 'Demo@1234';
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

const log = (...args) => console.log(...args);

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const monthKey = (offsetMonths) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Last N weekdays (Mon-Fri), most recent first in generation, returned oldest-first.
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
// Small shared helpers
// ---------------------------------------------------------------------------

async function upsertLoginUser({ schoolId, roleId, email, name, phone }) {
  let user = await User.findOne({ email });
  if (user) {
    log(`  [reuse] User login already exists: ${email}`);
    return { user, created: false };
  }
  if (DRY_RUN) {
    log(`  [dry-run] would create User login: ${email}`);
    return { user: null, created: false };
  }
  const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);
  user = await User.create({
    schoolId,
    roleId,
    email,
    password: hashed,
    name,
    phone: phone || '',
    status: 'ACTIVE',
  });
  log(`  [create] User login created: ${email} (password: ${DEMO_PASSWORD})`);
  return { user, created: true };
}

async function findOrCreateRole({ schoolId, code, name, description, hierarchyLevel, permissions }) {
  let role = await Role.findOne({ schoolId, code });
  if (role) {
    log(`  [reuse] Role ${code} already exists`);
    return role;
  }
  if (DRY_RUN) {
    log(`  [dry-run] would create Role ${code}`);
    return { _id: null, code, permissions };
  }
  role = await Role.create({
    schoolId,
    name,
    code,
    description,
    hierarchyLevel,
    isSystem: false,
    status: 'ACTIVE',
    permissions,
  });
  log(`  [create] Role ${code} created`);
  return role;
}

// Additive only — never removes a permission a role already has.
async function ensureRoleHasPermission(role, permCode) {
  if (!role) return role;
  const perms = role.permissions || [];
  if (perms.includes(permCode) || perms.includes('*')) return role;
  if (DRY_RUN || !role._id) {
    log(`  [dry-run] would add permission '${permCode}' to role ${role.code}`);
    return role;
  }
  const updated = await Role.findByIdAndUpdate(
    role._id,
    { $addToSet: { permissions: permCode } },
    { new: true }
  );
  log(`  [update] added permission '${permCode}' to role ${role.code} (additive, existing permissions untouched)`);
  return updated;
}

// ---------------------------------------------------------------------------
// 1. School / AcademicYear
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

async function resolveAcademicYear(schoolId) {
  let ay = await AcademicYear.findOne({ schoolId, isCurrent: true });
  if (!ay) ay = await AcademicYear.findOne({ schoolId }).sort({ startDate: -1 });
  if (!ay) {
    throw new Error('No AcademicYear found for this school. Seed academic years first (e.g. npm run seed).');
  }
  return ay;
}

// ---------------------------------------------------------------------------
// 2. Demo student
// ---------------------------------------------------------------------------

async function pickDemoStudent(school, academicYear) {
  console.log('\n--- Step: Pick Demo Student ---');

  // Reuse the exact same fallback query portalStudentController.js /
  // portalParentController.js already use, so this is the same student an
  // admin / unlinked login already previews.
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

// ---------------------------------------------------------------------------
// 3. Guardian + Parent Portal login
// ---------------------------------------------------------------------------

async function setupGuardian(school, student) {
  console.log('\n--- Step: Guardian + Parent Portal Login ---');

  let link = await StudentGuardian.findOne({ schoolId: school._id, studentId: student._id }).populate('guardianId');
  let guardian = link && link.guardianId ? link.guardianId : null;

  const fallbackEmail = `parent.demo.${student.admissionNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '') + '@schoolerp.com';

  if (!guardian) {
    const relationship = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'].includes(student.emergencyContact?.relationship)
      ? student.emergencyContact.relationship
      : 'FATHER';
    const name = student.emergencyContact?.name || `${student.firstName} Guardian`;

    if (DRY_RUN) {
      log(`  [dry-run] would create Guardian '${name}' <${fallbackEmail}>`);
      guardian = { _id: null, name, email: fallbackEmail, relationship };
    } else {
      guardian = await Guardian.create({
        schoolId: school._id,
        name,
        relationship,
        phone: student.emergencyContact?.phone || student.phone || '+91 90000 00000',
        email: fallbackEmail,
        occupation: 'Parent',
        address: [student.address?.street, student.address?.city].filter(Boolean).join(', '),
        isPrimary: true,
        isEmergencyContact: true,
        status: 'ACTIVE',
      });
      log(`  [create] Guardian created: ${guardian.name} <${guardian.email}>`);
    }
  } else {
    log(`  [reuse] Guardian already linked to this student: ${guardian.name}`);
    if (!guardian.email) {
      if (DRY_RUN) {
        log(`  [dry-run] would backfill missing Guardian.email -> ${fallbackEmail}`);
        guardian.email = fallbackEmail;
      } else {
        guardian = await Guardian.findByIdAndUpdate(guardian._id, { $set: { email: fallbackEmail } }, { new: true });
        log(`  [update] backfilled missing Guardian.email -> ${fallbackEmail} (only the empty field was set)`);
      }
    }
  }

  if (!link) {
    if (DRY_RUN) {
      log('  [dry-run] would create StudentGuardian link');
    } else {
      link = await StudentGuardian.create({
        schoolId: school._id,
        studentId: student._id,
        guardianId: guardian._id,
        relationship: guardian.relationship || 'FATHER',
        isPrimary: true,
        isEmergencyContact: true,
      });
      log('  [create] StudentGuardian link created');
    }
  } else {
    log('  [reuse] StudentGuardian link already exists');
  }

  const parentRole = await findOrCreateRole({
    schoolId: school._id,
    code: 'PARENT',
    name: 'Parent / Guardian',
    description: 'Parent Portal self-service access for guardians tracking their child\'s progress',
    hierarchyLevel: 6,
    permissions: ['parent_portal_view'],
  });
  await ensureRoleHasPermission(parentRole, 'parent_portal_view');

  const guardianEmail = guardian.email || fallbackEmail;
  const { user, created } = await upsertLoginUser({
    schoolId: school._id,
    roleId: parentRole._id,
    email: guardianEmail,
    name: guardian.name,
    phone: guardian.phone,
  });

  return { guardian, guardianEmail, guardianUserCreated: created };
}

// ---------------------------------------------------------------------------
// 4. Teacher + Teacher Portal login
// ---------------------------------------------------------------------------

async function setupTeacher(school) {
  console.log('\n--- Step: Teaching Staff + Teacher Portal Login ---');

  let staff = await Staff.findOne({ schoolId: school._id, isTeachingStaff: true, status: 'ACTIVE', firstName: { $ne: '' } }).sort({ _id: 1 });
  if (!staff) {
    staff = await Staff.findOne({ schoolId: school._id, isTeachingStaff: true, status: 'ACTIVE' }).sort({ _id: 1 });
  }
  let teacherUserCreated = false;

  if (staff) {
    log(`  [reuse] Teaching Staff found: ${staff.firstName} ${staff.lastName} (${staff.employeeId})`);
  } else {
    const teacherRole = await findOrCreateRole({
      schoolId: school._id,
      code: 'TEACHER',
      name: 'Class Teacher / Educator',
      description: 'Academic Educator managing assigned class sections, subjects and grades',
      hierarchyLevel: 4,
      permissions: ['staff_view', 'teacher_view', 'teacher_portal_view'],
    });
    await ensureRoleHasPermission(teacherRole, 'teacher_portal_view');

    const email = 'teacher.demo@schoolerp.com';
    if (DRY_RUN) {
      log(`  [dry-run] would create User login <${email}> and Staff 'Demo Teacher'`);
      return { staff: null, teacherEmail: email, teacherUserCreated: false };
    }

    const { user, created } = await upsertLoginUser({
      schoolId: school._id,
      roleId: teacherRole._id,
      email,
      name: 'Demo Teacher',
      phone: '+91 98000 00001',
    });
    teacherUserCreated = created;

    staff = await Staff.create({
      schoolId: school._id,
      userId: user._id,
      employeeId: `EMP-DEMO-${Date.now().toString().slice(-6)}`,
      firstName: 'Demo',
      lastName: 'Teacher',
      email,
      phone: '+91 98000 00001',
      designation: 'Class Teacher',
      department: 'Academics',
      isTeachingStaff: true,
      status: 'ACTIVE',
    });
    log(`  [create] Staff created: ${staff.firstName} ${staff.lastName} (${staff.employeeId})`);
  }

  let teacherEmail = staff.email;
  if (staff.userId) {
    const teacherUser = await User.findById(staff.userId).populate('roleId');
    if (teacherUser) {
      teacherEmail = teacherUser.email;
      if (teacherUser.roleId) {
        await ensureRoleHasPermission(teacherUser.roleId, 'teacher_portal_view');
      } else {
        log('  [warn] Staff\'s User has no roleId — cannot verify teacher_portal_view permission.');
      }
    }
  }

  return { staff, teacherEmail, teacherUserCreated };
}

async function setupTeacherAssignments(school, staff, enrollment) {
  console.log('\n--- Step: Teacher Assignments (Assigned Classes) ---');
  const gradeId = enrollment.gradeId?._id || enrollment.gradeId;
  const sectionId = enrollment.sectionId?._id || enrollment.sectionId;
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;

  let classSubjects = await ClassSubject.find({ schoolId: school._id, gradeId, status: 'ACTIVE' })
    .populate('subjectId')
    .limit(4);
  let subjects = classSubjects.map((cs) => cs.subjectId).filter(Boolean);
  if (subjects.length === 0) {
    subjects = await Subject.find({ schoolId: school._id, status: 'ACTIVE' }).limit(4);
  }
  subjects = subjects.slice(0, 3);

  if (subjects.length === 0) {
    log('  [warn] No ACTIVE Subjects found in this school — TeacherAssignment/Timetable/ExamResult seeding will be skipped.');
    return { assignments: [], subjects: [] };
  }

  if (!staff || !staff._id) {
    subjects.forEach((s) => log(`  [dry-run] would create TeacherAssignment for ${s.name}`));
    return { assignments: [], subjects };
  }

  const assignments = [];
  for (let i = 0; i < subjects.length; i++) {
    const subject = subjects[i];
    let assignment = await TeacherAssignment.findOne({
      schoolId: school._id,
      academicYearId,
      gradeId,
      sectionId,
      subjectId: subject._id,
      staffId: staff._id,
    });

    if (assignment) {
      if (assignment.status !== 'ACTIVE' && !DRY_RUN) {
        assignment = await TeacherAssignment.findByIdAndUpdate(assignment._id, { $set: { status: 'ACTIVE' } }, { new: true });
        log(`  [update] Reactivated TeacherAssignment for ${subject.name}`);
      } else {
        log(`  [reuse] TeacherAssignment already exists for ${subject.name}`);
      }
    } else if (DRY_RUN) {
      log(`  [dry-run] would create TeacherAssignment for ${subject.name}`);
    } else {
      assignment = await TeacherAssignment.create({
        schoolId: school._id,
        academicYearId,
        staffId: staff._id,
        gradeId,
        sectionId,
        subjectId: subject._id,
        isClassTeacher: i === 0,
        assignmentType: 'PRIMARY',
        status: 'ACTIVE',
      });
      log(`  [create] TeacherAssignment created for ${subject.name}`);
    }
    if (assignment) assignments.push(assignment);
  }

  return { assignments, subjects };
}

// ---------------------------------------------------------------------------
// 5. Timetable
// ---------------------------------------------------------------------------

async function setupTimetable(school, enrollment, teacherId, subjects) {
  console.log('\n--- Step: Timetable ---');
  const gradeId = enrollment.gradeId?._id || enrollment.gradeId;
  const sectionId = enrollment.sectionId?._id || enrollment.sectionId;
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;

  const existingCount = await Timetable.countDocuments({ schoolId: school._id, gradeId, sectionId, status: 'ACTIVE' });
  if (existingCount >= 5) {
    log(`  [reuse] ${existingCount} ACTIVE Timetable entries already exist for this grade/section — leaving as is.`);
    return;
  }

  const effectiveTeacherId = teacherId || (DRY_RUN ? new mongoose.Types.ObjectId() : null);
  if (!effectiveTeacherId || subjects.length === 0) {
    log('  [skip] Missing teacher or subjects — cannot seed Timetable.');
    return;
  }

  const periods = await Period.find({ schoolId: school._id, status: 'ACTIVE', type: 'INSTRUCTIONAL' })
    .sort({ sequence: 1 })
    .limit(6);
  if (periods.length === 0) {
    log('  [warn] No ACTIVE INSTRUCTIONAL Periods found in this school — cannot seed Timetable.');
    return;
  }

  let created = 0;
  for (const day of DAYS) {
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      const subject = subjects[i % subjects.length];

      const existing = await Timetable.findOne({
        schoolId: school._id,
        academicYearId,
        sectionId,
        dayOfWeek: day,
        periodId: period._id,
        status: 'ACTIVE',
      });
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
          // Same non-destructive collision handling as seedDatabase.js: the
          // teacher (or room) is already booked for this day+period elsewhere
          // — skip this slot rather than erroring the whole run.
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
// 6. Attendance
// ---------------------------------------------------------------------------

async function setupAttendanceStatuses(school) {
  console.log('\n--- Step: Attendance Statuses ---');
  const defaults = {
    PRESENT: { name: 'Present', shortCode: 'P', countsAsPresent: true, countsAsAbsent: false, colorToken: 'emerald', sequence: 1 },
    ABSENT: { name: 'Absent', shortCode: 'A', countsAsPresent: false, countsAsAbsent: true, colorToken: 'rose', sequence: 2 },
    LATE: { name: 'Late Arrival', shortCode: 'L', countsAsPresent: true, countsAsAbsent: false, requiresReason: true, colorToken: 'amber', sequence: 3 },
    EXCUSED: { name: 'Excused Absence', shortCode: 'E', countsAsPresent: false, countsAsAbsent: false, requiresReason: true, colorToken: 'sky', sequence: 4 },
  };

  const statusMap = {};
  for (const code of Object.keys(defaults)) {
    let doc = await AttendanceStatus.findOne({ schoolId: school._id, code });
    if (doc) {
      log(`  [reuse] AttendanceStatus '${code}' already exists`);
      statusMap[code] = doc;
      continue;
    }
    if (DRY_RUN) {
      log(`  [dry-run] would create AttendanceStatus '${code}'`);
      statusMap[code] = { _id: null, code };
      continue;
    }
    doc = await AttendanceStatus.create({ schoolId: school._id, code, status: 'ACTIVE', ...defaults[code] });
    log(`  [create] AttendanceStatus '${code}' created`);
    statusMap[code] = doc;
  }
  return statusMap;
}

async function setupAttendance(school, enrollment, student, statusMap) {
  console.log('\n--- Step: Attendance Records ---');
  const existingCount = await AttendanceRecord.countDocuments({ schoolId: school._id, studentId: student._id });
  if (existingCount >= 10) {
    log(`  [reuse] ${existingCount} AttendanceRecord(s) already exist for this student — leaving as is.`);
    return;
  }

  const gradeId = enrollment.gradeId?._id || enrollment.gradeId;
  const sectionId = enrollment.sectionId?._id || enrollment.sectionId;
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;
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
// 7. Exam results
// ---------------------------------------------------------------------------

async function setupExamResults(school, enrollment, student, subjects) {
  console.log('\n--- Step: Exam Results ---');
  const existingCount = await ExamResult.countDocuments({ schoolId: school._id, studentId: student._id, status: 'PUBLISHED' });
  if (existingCount >= 3) {
    log(`  [reuse] ${existingCount} PUBLISHED ExamResult(s) already exist — leaving as is.`);
    return;
  }
  if (subjects.length === 0) {
    log('  [skip] No subjects available — cannot seed ExamResult.');
    return;
  }

  const gradeId = enrollment.gradeId?._id || enrollment.gradeId;
  const sectionId = enrollment.sectionId?._id || enrollment.sectionId;
  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;

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
      subjectId: subject._id,
      examTitle: exam.examTitle,
    });
    if (existing) continue;

    const percentage = 70 + ((i * 7) % 25); // spread of ~70-94%
    const totalObtained = Math.round((percentage / 100) * exam.maxMarks);
    const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : 'C';

    if (DRY_RUN) {
      log(`  [dry-run] would create ExamResult '${exam.examTitle}' for ${subject.name} (${percentage}%)`);
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
      publishedAt: new Date(),
    });
    created++;
  }
  log(`  [create] ${created} ExamResult(s) created.`);
}

// ---------------------------------------------------------------------------
// 8. Announcements
// ---------------------------------------------------------------------------

async function setupAnnouncements(school, academicYear) {
  console.log('\n--- Step: Announcements ---');
  const existingCount = await Announcement.countDocuments({ schoolId: school._id, status: 'PUBLISHED' });
  if (existingCount >= 3) {
    log(`  [reuse] ${existingCount} PUBLISHED Announcement(s) already exist — leaving as is.`);
    return;
  }

  const items = [
    {
      title: 'Welcome Back to the New Term',
      content: 'We are excited to welcome all students and parents back for the new term. Please review the updated academic calendar available on the school portal.',
      announcementType: 'GENERAL',
      priority: 'NORMAL',
    },
    {
      title: 'Mid-Term Assessment Schedule Released',
      content: 'The Mid-Term Assessment schedule has been published. Students are advised to check their timetable and prepare accordingly.',
      announcementType: 'EXAM',
      priority: 'HIGH',
    },
    {
      title: 'Parent-Teacher Meeting Scheduled',
      content: 'A Parent-Teacher meeting has been scheduled to discuss student progress. Please coordinate with the class teacher for your time slot.',
      announcementType: 'ACADEMIC',
      priority: 'NORMAL',
    },
    {
      title: 'Fee Payment Reminder for This Term',
      content: 'Parents are reminded to clear pending fee dues before the due date to avoid late fine charges.',
      announcementType: 'FEE',
      priority: 'URGENT',
    },
  ];

  let created = 0;
  for (const item of items) {
    const existing = await Announcement.findOne({ schoolId: school._id, title: item.title });
    if (existing) continue;

    if (DRY_RUN) {
      log(`  [dry-run] would create Announcement '${item.title}'`);
      continue;
    }

    await Announcement.create({
      schoolId: school._id,
      academicYearId: academicYear._id,
      title: item.title,
      content: item.content,
      summary: item.content.slice(0, 100),
      announcementType: item.announcementType,
      priority: item.priority,
      audienceType: 'SCHOOL',
      publishAt: new Date(),
      status: 'PUBLISHED',
      publishedAt: new Date(),
    });
    created++;
  }
  log(`  [create] ${created} Announcement(s) created.`);
}

// ---------------------------------------------------------------------------
// 9. Fees (Invoice + Payment)
// ---------------------------------------------------------------------------

async function setupFees(school, enrollment, student) {
  console.log('\n--- Step: Invoices & Payments ---');
  const existingCount = await Invoice.countDocuments({ schoolId: school._id, studentId: student._id });
  if (existingCount >= 2) {
    log(`  [reuse] ${existingCount} Invoice(s) already exist for this student — leaving as is.`);
    return;
  }

  let feeCategory = await FeeCategory.findOne({ schoolId: school._id, code: 'TUITION' });
  if (!feeCategory) {
    if (DRY_RUN) {
      log('  [dry-run] would create FeeCategory TUITION');
    } else {
      feeCategory = await FeeCategory.create({
        schoolId: school._id,
        name: 'Tuition Fee',
        code: 'TUITION',
        categoryType: 'TUITION',
        sequence: 1,
        status: 'ACTIVE',
      });
      log('  [create] FeeCategory TUITION created');
    }
  } else {
    log('  [reuse] FeeCategory TUITION already exists');
  }

  const academicYearId = enrollment.academicYearId?._id || enrollment.academicYearId;
  const admSuffix = String(student.admissionNumber).replace(/[^0-9A-Za-z]/g, '').slice(-8);

  const invoicesToCreate = [
    { suffix: 'A', billingPeriod: monthKey(0), totalAmount: 6500, paidAmount: 6500, status: 'PAID', dueOffsetDays: -20 },
    { suffix: 'B', billingPeriod: monthKey(-1), totalAmount: 6500, paidAmount: 3000, status: 'PARTIALLY_PAID', dueOffsetDays: -5 },
  ];

  let paymentIdx = 0;
  for (const spec of invoicesToCreate) {
    const invoiceNumber = `INV-DEMO-${admSuffix}-${spec.suffix}`;
    const existingInvoice = await Invoice.findOne({ schoolId: school._id, invoiceNumber });
    if (existingInvoice) {
      log(`  [reuse] Invoice ${invoiceNumber} already exists`);
      continue;
    }
    if (DRY_RUN) {
      log(`  [dry-run] would create Invoice ${invoiceNumber} (${spec.status}, total ${spec.totalAmount}, paid ${spec.paidAmount})`);
      continue;
    }

    const balanceAmount = spec.totalAmount - spec.paidAmount;
    const dueDate = addDays(new Date(), spec.dueOffsetDays);
    const invoice = await Invoice.create({
      schoolId: school._id,
      academicYearId,
      studentId: student._id,
      enrollmentId: enrollment._id,
      invoiceNumber,
      invoiceDate: addDays(dueDate, -15),
      dueDate,
      billingPeriod: spec.billingPeriod,
      subtotal: spec.totalAmount,
      discountAmount: 0,
      concessionAmount: 0,
      fineAmount: 0,
      taxAmount: 0,
      totalAmount: spec.totalAmount,
      paidAmount: spec.paidAmount,
      balanceAmount,
      status: spec.status,
    });
    log(`  [create] Invoice ${invoiceNumber} created (${spec.status}, total ₹${spec.totalAmount}, paid ₹${spec.paidAmount}, balance ₹${balanceAmount})`);

    if (feeCategory) {
      await InvoiceItem.create({
        schoolId: school._id,
        invoiceId: invoice._id,
        feeCategoryId: feeCategory._id,
        description: 'Tuition Fee',
        quantity: 1,
        unitAmount: spec.totalAmount,
        grossAmount: spec.totalAmount,
        discountAmount: 0,
        concessionAmount: 0,
        fineAmount: 0,
        netAmount: spec.totalAmount,
        sequence: 1,
      });
    }

    if (spec.paidAmount > 0) {
      paymentIdx++;
      const paymentNumber = `PAY-DEMO-${admSuffix}-${paymentIdx}`;
      const idempotencyKey = `SEED-PORTAL-DEMO-${admSuffix}-${paymentIdx}`;
      let payment = await Payment.findOne({ schoolId: school._id, idempotencyKey });
      if (!payment) {
        payment = await Payment.create({
          schoolId: school._id,
          studentId: student._id,
          paymentNumber,
          paymentDate: addDays(dueDate, -10),
          amount: spec.paidAmount,
          currency: 'INR',
          paymentMethod: 'UPI',
          referenceNumber: `REF-DEMO-${admSuffix}-${paymentIdx}`,
          status: 'SUCCESS',
          idempotencyKey,
        });
        await PaymentAllocation.create({
          schoolId: school._id,
          paymentId: payment._id,
          invoiceId: invoice._id,
          studentId: student._id,
          allocatedAmount: spec.paidAmount,
          allocationDate: payment.paymentDate,
        });
        log(`  [create] Payment ${paymentNumber} created for ₹${spec.paidAmount}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 10. Optional: Student's own portal login
// ---------------------------------------------------------------------------

async function setupStudentLogin(school, student) {
  console.log('\n--- Step: Student Portal Login (bonus — Student model has no userId, matched by email) ---');

  let email = student.email && student.email.includes('@') ? student.email : null;
  if (!email) {
    email = `${student.firstName}.${student.lastName}.${student.admissionNumber}`
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '') + '@student.schoolerp.com';

    if (DRY_RUN) {
      log(`  [dry-run] would backfill empty Student.email -> ${email}`);
    } else {
      await Student.findOneAndUpdate({ _id: student._id, $or: [{ email: null }, { email: '' }] }, { $set: { email } });
      log(`  [update] backfilled empty Student.email -> ${email} (only the empty field was set)`);
    }
  } else {
    log(`  [reuse] Student already has an email: ${email}`);
  }

  const studentRole = await findOrCreateRole({
    schoolId: school._id,
    code: 'STUDENT',
    name: 'Student',
    description: 'Student Portal self-service access',
    hierarchyLevel: 6,
    permissions: ['student_portal_view'],
  });
  await ensureRoleHasPermission(studentRole, 'student_portal_view');

  const { created } = await upsertLoginUser({
    schoolId: school._id,
    roleId: studentRole._id,
    email,
    name: `${student.firstName} ${student.lastName}`,
    phone: student.phone,
  });

  return { studentEmail: email, studentUserCreated: created };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  try {
    console.log(`\nPortal Demo Data Seeder ${DRY_RUN ? '(DRY RUN — no writes will be made)' : ''}`);
    await connectToDatabase();

    const school = await resolveSchool();
    console.log(`School: ${school.name} (${school._id})`);
    const academicYear = await resolveAcademicYear(school._id);
    console.log(`Academic Year (current): ${academicYear.name} (${academicYear._id})`);

    const { student, enrollment } = await pickDemoStudent(school, academicYear);

    const { guardian, guardianEmail, guardianUserCreated } = await setupGuardian(school, student);
    const { staff, teacherEmail, teacherUserCreated } = await setupTeacher(school);
    const teacherId = staff && staff._id ? staff._id : null;

    const { subjects } = await setupTeacherAssignments(school, staff, enrollment);

    await setupTimetable(school, enrollment, teacherId, subjects);

    const statusMap = await setupAttendanceStatuses(school);
    await setupAttendance(school, enrollment, student, statusMap);

    await setupExamResults(school, enrollment, student, subjects);

    await setupAnnouncements(school, academicYear);

    await setupFees(school, enrollment, student);

    const { studentEmail, studentUserCreated } = await setupStudentLogin(school, student);

    console.log('\n================ SUMMARY ================');
    console.log(`Student:   ${student.firstName} ${student.lastName}  (Admission# ${student.admissionNumber})`);
    console.log(`           Grade ${enrollment.gradeId?.name || 'N/A'} / Section ${enrollment.sectionId?.name || 'N/A'}`);
    console.log('');
    console.log(`Parent Portal login   : ${guardianEmail}`);
    console.log(`  password            : ${guardianUserCreated ? DEMO_PASSWORD : `unchanged (this User already existed — use whatever password it was created with)`}`);
    console.log('');
    console.log(`Teacher Portal login  : ${teacherEmail}`);
    console.log(`  password            : ${teacherUserCreated ? DEMO_PASSWORD : `unchanged (this User already existed — e.g. 'admin123' if it came from npm run seed)`}`);
    console.log('');
    console.log(`Student Portal login  : ${studentEmail}`);
    console.log(`  password            : ${studentUserCreated ? DEMO_PASSWORD : `unchanged (this User already existed — use whatever password it was created with)`}`);
    console.log('===========================================');
    console.log(`\nDone.${DRY_RUN ? ' Re-run without --dry-run to apply these changes.' : ' Log in with the credentials above and open the Student, Teacher and Parent Portal pages.'}`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
