/**
 * Script: seedSubjectTeachersAndAssignments.js
 * 
 * Comprehensive, flexible teacher creation and subject-teacher allocation
 * pipeline for Tamil Nadu School ERP.
 * 
 * Key Principles:
 *   1. Preserves Single Source of Truth:
 *      Existing 44 Class Teachers (`EMP-2001` to `EMP-2044`) remain exclusively
 *      set on `Section.classTeacherId`.
 *   2. Pre-KG Single-Teacher Homeroom Model:
 *      For Pre-KG (Sections A, B, C, D), the section's Class Teacher is assigned
 *      as the sole educator for the entire day across ALL 5 Pre-KG subjects.
 *   3. 1st to 10th Standard Subject Specialists:
 *      For 1st–10th Standards, every section's subjects (Core 5: Tamil, English,
 *      Maths, Science, Social + Computer, PET, Value Ed, Art, Hindi, French)
 *      are allocated to qualified subject specialist teachers.
 *   4. Balanced Faculty Roster (Exact 50/50 Male/Female):
 *      Provisions 36 additional authentic Tamil-named teachers (18 Male, 18 Female)
 *      with realistic qualifications (M.P.Ed., M.C.A., B.Ed., M.A. French/Hindi,
 *      M.Sc. Maths/Science), bringing total teaching faculty to 80 (40 Male, 40 Female).
 *   5. Flexible Configuration:
 *      Teacher candidate pool, subject-to-specialization mapping, and allocation
 *      rules are declared at the top of the file.
 * 
 * Usage:
 *   node src/scripts/seedSubjectTeachersAndAssignments.js --dry-run   # Preview actions (safe)
 *   node src/scripts/seedSubjectTeachersAndAssignments.js --commit    # Apply to MongoDB Atlas
 */

require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
const bcrypt = require('bcryptjs');

// DNS server fallback for robust MongoDB Atlas connection on Windows
if (process.env.MONGODB_DNS_SERVERS) {
  const dnsServers = process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim());
  dns.setServers(dnsServers);
} else {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
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
      console.log('✓ Connected to MongoDB Atlas successfully.\n');
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

// Models
const School = require('../models/School');
const AcademicYear = require('../models/AcademicYear');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Role = require('../models/Role');
const User = require('../models/User');
const Staff = require('../models/Staff');
const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');

/**
 * ----------------------------------------------------------------------------
 * 1. ADDITIONAL QUALIFIED TAMIL TEACHERS (18 Male, 18 Female = 36 Teachers)
 * ----------------------------------------------------------------------------
 * Employee IDs: EMP-2045 to EMP-2080.
 * Adding these to the 44 existing Class Teachers (EMP-2001 to EMP-2044) results
 * in 80 teachers total (exact 40 Male, 40 Female 50/50 balance).
 */
const ADDITIONAL_MALE_TEACHERS = [
  { firstName: 'Muruganandam', lastName: 'K', qualification: 'M.P.Ed., M.Phil. (Physical Education)', experienceYears: 12, phone: '+91 98401 23045', subjectArea: 'PET', designation: 'Physical Education Director' },
  { firstName: 'Thirumavalavan', lastName: 'R', qualification: 'M.C.A., B.Ed. (Computer Science)', experienceYears: 8, phone: '+91 98401 23046', subjectArea: 'CS', designation: 'Senior Computer Instructor' },
  { firstName: 'Kalidasan', lastName: 'M', qualification: 'M.A., B.Ed. (Hindi Literature)', experienceYears: 9, phone: '+91 98401 23047', subjectArea: 'HIN', designation: 'Hindi Pandit' },
  { firstName: 'Pugazhendhi', lastName: 'S', qualification: 'M.F.A. (Drawing & Fine Arts)', experienceYears: 10, phone: '+91 98401 23048', subjectArea: 'ART', designation: 'Art & Craft Instructor' },
  { firstName: 'Chezhian', lastName: 'V', qualification: 'M.A., B.Ed. (French Literature)', experienceYears: 7, phone: '+91 98401 23049', subjectArea: 'FRE', designation: 'French Language Educator' },
  { firstName: 'Annamalai', lastName: 'P', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 11, phone: '+91 98401 23050', subjectArea: 'MATH', designation: 'Senior Mathematics Teacher' },
  { firstName: 'Iniyan', lastName: 'T', qualification: 'M.Sc., B.Ed. (Physics)', experienceYears: 6, phone: '+91 98401 23051', subjectArea: 'SCI', designation: 'Science Educator' },
  { firstName: 'Senthamizh Chelvan', lastName: 'E', qualification: 'M.A., M.Phil., B.Ed. (Tamil)', experienceYears: 14, phone: '+91 98401 23052', subjectArea: 'TAM', designation: 'Senior Tamil Pandit' },
  { firstName: 'Gunasekaran', lastName: 'J', qualification: 'M.Sc., B.Ed. (Chemistry)', experienceYears: 9, phone: '+91 98401 23053', subjectArea: 'SCI', designation: 'Science Educator' },
  { firstName: 'Arun Pandian', lastName: 'N', qualification: 'B.P.Ed., NIS (Athletics)', experienceYears: 5, phone: '+91 98401 23054', subjectArea: 'PET', designation: 'Athletics & Sports Coach' },
  { firstName: 'Tamizhselvan', lastName: 'G', qualification: 'M.A., B.Ed. (History & Civics)', experienceYears: 10, phone: '+91 98401 23055', subjectArea: 'SOC-SCI', designation: 'Social Science Teacher' },
  { firstName: 'Kathiravan', lastName: 'B', qualification: 'M.Sc., B.Ed. (Environmental Science)', experienceYears: 7, phone: '+91 98401 23056', subjectArea: 'EVS', designation: 'Environmental Science Teacher' },
  { firstName: 'Vasanth Kumar', lastName: 'L', qualification: 'M.A., M.Ed. (English Literature)', experienceYears: 8, phone: '+91 98401 23057', subjectArea: 'ENG', designation: 'English Language Teacher' },
  { firstName: 'Muthukumar', lastName: 'S', qualification: 'B.E. (CSE), B.Ed.', experienceYears: 6, phone: '+91 98401 23058', subjectArea: 'CS', designation: 'Computer Science Faculty' },
  { firstName: 'Chidambaram', lastName: 'D', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 13, phone: '+91 98401 23059', subjectArea: 'MATH', designation: 'Senior Mathematics Teacher' },
  { firstName: 'Elangovan', lastName: 'A', qualification: 'M.A., B.Ed. (Economics & Geography)', experienceYears: 9, phone: '+91 98401 23060', subjectArea: 'SOC-SCI', designation: 'Social Science Teacher' },
  { firstName: 'Sundaravel', lastName: 'C', qualification: 'M.Sc., B.Ed. (Zoology & Life Sciences)', experienceYears: 7, phone: '+91 98401 23061', subjectArea: 'SCI', designation: 'Life Sciences Teacher' },
  { firstName: 'Velmurugan', lastName: 'T', qualification: 'B.P.Ed., Yoga Diploma', experienceYears: 6, phone: '+91 98401 23062', subjectArea: 'VE', designation: 'Yoga & Value Education Instructor' },
];

const ADDITIONAL_FEMALE_TEACHERS = [
  { firstName: 'Thamarai Selvi', lastName: 'S', qualification: 'M.P.Ed., NIS (Basketball & Athletics)', experienceYears: 10, phone: '+91 98401 23063', subjectArea: 'PET', designation: 'Physical Education Director' },
  { firstName: 'Vanmathi', lastName: 'K', qualification: 'M.C.A., B.Ed. (Information Tech)', experienceYears: 8, phone: '+91 98401 23064', subjectArea: 'CS', designation: 'Computer Science Faculty' },
  { firstName: 'Poonguzhali', lastName: 'M', qualification: 'M.A., B.Ed. (Hindi Literature)', experienceYears: 9, phone: '+91 98401 23065', subjectArea: 'HIN', designation: 'Hindi Pandit' },
  { firstName: 'Senthamarai', lastName: 'R', qualification: 'B.F.A., Diploma in Handicrafts', experienceYears: 7, phone: '+91 98401 23066', subjectArea: 'ART', designation: 'Visual Arts & Craft Instructor' },
  { firstName: 'Yazhini', lastName: 'P', qualification: 'M.A., B.Ed. (French)', experienceYears: 6, phone: '+91 98401 23067', subjectArea: 'FRE', designation: 'French Language Educator' },
  { firstName: 'Kayalvizhi', lastName: 'T', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 11, phone: '+91 98401 23068', subjectArea: 'MATH', designation: 'Senior Mathematics Teacher' },
  { firstName: 'Malliga', lastName: 'V', qualification: 'M.Sc., B.Ed. (Chemistry)', experienceYears: 8, phone: '+91 98401 23069', subjectArea: 'SCI', designation: 'Chemistry & Science Teacher' },
  { firstName: 'Karpagavalli', lastName: 'E', qualification: 'M.A., B.Ed. (Tamil Literature)', experienceYears: 12, phone: '+91 98401 23070', subjectArea: 'TAM', designation: 'Senior Tamil Pandit' },
  { firstName: 'Vijayalakshmi', lastName: 'G', qualification: 'M.Sc., B.Ed. (Physics)', experienceYears: 9, phone: '+91 98401 23071', subjectArea: 'SCI', designation: 'Physics & Science Teacher' },
  { firstName: 'Shenbagam', lastName: 'N', qualification: 'M.P.Ed., Yoga Instructor', experienceYears: 6, phone: '+91 98401 23072', subjectArea: 'PET', designation: 'Physical Health & Yoga Coach' },
  { firstName: 'Manimegalai', lastName: 'B', qualification: 'M.A., B.Ed. (Social Sciences)', experienceYears: 10, phone: '+91 98401 23073', subjectArea: 'SOC-SCI', designation: 'Social Science Teacher' },
  { firstName: 'Punitha', lastName: 'L', qualification: 'M.Sc., B.Ed. (Botany & Life Sciences)', experienceYears: 7, phone: '+91 98401 23074', subjectArea: 'SCI', designation: 'Biological Sciences Teacher' },
  { firstName: 'Aruna Devi', lastName: 'J', qualification: 'M.A., B.Ed. (English Literature)', experienceYears: 8, phone: '+91 98401 23075', subjectArea: 'ENG', designation: 'English Language Teacher' },
  { firstName: 'Subhashini', lastName: 'D', qualification: 'M.Sc., B.Ed. (Computer Science)', experienceYears: 5, phone: '+91 98401 23076', subjectArea: 'CS', designation: 'Computer Applications Teacher' },
  { firstName: 'Kalaichelvi', lastName: 'A', qualification: 'M.Sc., M.Ed. (Mathematics)', experienceYears: 14, phone: '+91 98401 23077', subjectArea: 'MATH', designation: 'Senior Mathematics Teacher' },
  { firstName: 'Kanchana', lastName: 'S', qualification: 'M.A., B.Ed. (Geography & Economics)', experienceYears: 9, phone: '+91 98401 23078', subjectArea: 'SOC-SCI', designation: 'Social Science Teacher' },
  { firstName: 'Amudhavalli', lastName: 'C', qualification: 'M.Sc., B.Ed. (Zoology & Microbiology)', experienceYears: 6, phone: '+91 98401 23079', subjectArea: 'SCI', designation: 'Life Sciences Teacher' },
  { firstName: 'Jayanthi', lastName: 'M', qualification: 'M.A., B.Ed. (Value Education & Life Skills)', experienceYears: 8, phone: '+91 98401 23080', subjectArea: 'VE', designation: 'Life Skills & Value Educator' },
];

/**
 * Normalizes subject codes to canonical subject areas
 */
function getSubjectAreaFromCode(code) {
  const c = String(code || '').toUpperCase();
  if (['TAM', 'PKG-TAM'].includes(c)) return 'TAM';
  if (['ENG', 'PKG-ENG'].includes(c)) return 'ENG';
  if (['MATH', 'PKG-NUM'].includes(c)) return 'MATH';
  if (['SCI', 'EVS'].includes(c)) return 'SCI';
  if (['SOC-SCI'].includes(c)) return 'SOC-SCI';
  if (['CS'].includes(c)) return 'CS';
  if (['PET', 'PKG-PLAY'].includes(c)) return 'PET';
  if (['ART', 'PKG-ART'].includes(c)) return 'ART';
  if (['VE', 'GK', 'LIB'].includes(c)) return 'VE';
  if (['HIN'].includes(c)) return 'HIN';
  if (['FRE'].includes(c)) return 'FRE';
  return 'GEN';
}

async function main() {
  const args = process.argv.slice(2);
  const isCommit = args.includes('--commit');
  const isDryRun = !isCommit || args.includes('--dry-run');

  console.log('='.repeat(78));
  console.log('  TAMIL NADU SCHOOL ERP - SUBJECT TEACHER CREATION & ASSIGNMENT PIPELINE');
  console.log('='.repeat(78));
  console.log(`  Mode: ${isDryRun ? '🔍 DRY RUN (Audit Preview Only - No Changes Applied)' : '🚀 COMMIT (Writing Changes to MongoDB Atlas)'}`);
  console.log('='.repeat(78) + '\n');

  await connectToDatabase();

  // 1. Resolve Target School
  const school = await School.findOne({ status: 'ACTIVE' }).lean() || await School.findOne().lean();
  if (!school) {
    console.error('✗ Error: No school record found.');
    process.exit(1);
  }
  const schoolId = school._id;
  console.log(`✓ Target School: "${school.name}" (ID: ${schoolId})`);

  // 2. Resolve Active Academic Year
  const academicYear = await AcademicYear.findOne({ schoolId, status: 'ACTIVE' }).lean() || await AcademicYear.findOne({ schoolId }).lean();
  if (!academicYear) {
    console.error('✗ Error: No academic year found.');
    process.exit(1);
  }
  const academicYearId = academicYear._id;
  console.log(`✓ Active Academic Year: "${academicYear.name}" (ID: ${academicYearId})`);

  // 3. Resolve Teacher Role
  const teacherRole = await Role.findOne({
    schoolId,
    $or: [{ code: 'TEACHER' }, { name: 'Class Teacher / Educator' }, { name: /teacher/i }],
  }).lean() || await Role.findOne({ code: 'TEACHER' }).lean();

  if (!teacherRole) {
    console.error('✗ Error: Teacher role not found.');
    process.exit(1);
  }
  const roleId = teacherRole._id;
  console.log(`✓ Teacher Role: "${teacherRole.name}" (Code: ${teacherRole.code}, ID: ${roleId})`);

  // 4. Resolve Existing Class Teachers (EMP-2001 to EMP-2044)
  const existingTeachers = await Staff.find({ schoolId, isTeachingStaff: true, status: 'ACTIVE' }).lean();
  console.log(`✓ Existing Active Teaching Staff: ${existingTeachers.length} teachers.`);

  // 5. Resolve Grades & Sections
  const grades = await Grade.find({ schoolId, status: 'ACTIVE' }).sort({ sequenceOrder: 1 }).lean();
  const sections = await Section.find({ schoolId, status: 'ACTIVE' }).populate('classTeacherId').lean();
  console.log(`✓ Total Grades: ${grades.length}, Total Active Sections: ${sections.length}`);

  // 6. Resolve Active ClassSubjects
  const classSubjects = await ClassSubject.find({ schoolId, status: 'ACTIVE' }).populate('subjectId').lean();
  console.log(`✓ Active ClassSubject Curriculum Mappings: ${classSubjects.length} records.\n`);

  if (classSubjects.length === 0) {
    console.error('✗ Error: No ClassSubject records found. Please run `npm run seed:subjects` first.');
    process.exit(1);
  }

  // Group ClassSubjects by gradeId
  const gradeSubjectsMap = new Map();
  for (const cs of classSubjects) {
    const gId = String(cs.gradeId);
    if (!gradeSubjectsMap.has(gId)) gradeSubjectsMap.set(gId, []);
    gradeSubjectsMap.get(gId).push(cs);
  }

  // Pre-KG Sections
  const preKgGrade = grades.find((g) => g.sequenceOrder === 0);
  const preKgSections = sections.filter((s) => String(s.gradeId) === String(preKgGrade?._id));
  const standardSections = sections.filter((s) => String(s.gradeId) !== String(preKgGrade?._id));

  console.log(`[Architecture Verification]`);
  console.log(`  - Pre-KG Sections (Single-Teacher Homeroom Model): ${preKgSections.length} sections`);
  console.log(`  - Standard 1st–10th Sections (Multi-Subject Specialist Model): ${standardSections.length} sections`);
  console.log(`  - Additional Subject Teachers to Provision: ${ADDITIONAL_MALE_TEACHERS.length + ADDITIONAL_FEMALE_TEACHERS.length} (18 Male, 18 Female)\n`);

  if (isDryRun) {
    console.log('--- [DRY RUN] Additional Subject Teachers Preview ---');
    console.log('Male Faculty Candidates (18):');
    ADDITIONAL_MALE_TEACHERS.forEach((t, i) => {
      const empId = `EMP-${2045 + i}`;
      console.log(`  • ${empId}: ${t.firstName} ${t.lastName} | Area: ${t.subjectArea} | ${t.qualification}`);
    });

    console.log('\nFemale Faculty Candidates (18):');
    ADDITIONAL_FEMALE_TEACHERS.forEach((t, i) => {
      const empId = `EMP-${2045 + 18 + i}`;
      console.log(`  • ${empId}: ${t.firstName} ${t.lastName} | Area: ${t.subjectArea} | ${t.qualification}`);
    });

    // Simulate Assignment Counts
    let preKgAssignmentsCount = 0;
    for (const sec of preKgSections) {
      const subs = gradeSubjectsMap.get(String(sec.gradeId)) || [];
      preKgAssignmentsCount += subs.length;
    }

    let standardAssignmentsCount = 0;
    for (const sec of standardSections) {
      const subs = gradeSubjectsMap.get(String(sec.gradeId)) || [];
      standardAssignmentsCount += subs.length;
    }

    console.log('\n--- [DRY RUN] Projected Teacher Assignments ---');
    console.log(`  • Pre-KG Assignments: ${preKgAssignmentsCount} (1 class teacher per section across all 5 subjects)`);
    console.log(`  • 1st–10th Standard Assignments: ${standardAssignmentsCount} (Subject specialists allocated per section)`);
    console.log(`  • Total Projected Assignments: ${preKgAssignmentsCount + standardAssignmentsCount}`);

    console.log('\n==============================================================================');
    console.log('DRY RUN COMPLETE — Zero data was modified.');
    console.log('To apply these changes to MongoDB Atlas, run:');
    console.log('  node src/scripts/seedSubjectTeachersAndAssignments.js --commit');
    console.log('==============================================================================\n');
    await mongoose.disconnect();
    return;
  }

  // --- COMMIT MODE ---
  console.log('Executing database updates...\n');

  // Step 1: Clean existing TeacherAssignment records
  console.log('Step 1: Cleaning existing TeacherAssignment collection...');
  const deletedAssignments = await TeacherAssignment.deleteMany({ schoolId });
  console.log(`  ✓ Removed ${deletedAssignments.deletedCount} old TeacherAssignment records.`);

  // Step 2: Provision Additional 36 Teachers (EMP-2045 to EMP-2080)
  console.log('\nStep 2: Provisioning 36 Additional Subject Teachers with User Accounts...');
  const combinedNewTeachers = [
    ...ADDITIONAL_MALE_TEACHERS.map((t, idx) => ({ ...t, gender: 'MALE', employeeId: `EMP-${2045 + idx}` })),
    ...ADDITIONAL_FEMALE_TEACHERS.map((t, idx) => ({ ...t, gender: 'FEMALE', employeeId: `EMP-${2045 + 18 + idx}` })),
  ];

  const defaultPasswordHash = await bcrypt.hash('Teacher@123', 10);
  const newlyCreatedStaff = [];

  for (const t of combinedNewTeachers) {
    let existingStaff = await Staff.findOne({ schoolId, employeeId: t.employeeId });
    if (existingStaff) {
      newlyCreatedStaff.push({ ...existingStaff.toObject(), subjectArea: t.subjectArea });
      continue;
    }

    // Clean email slug
    const emailPrefix = `${t.firstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${t.lastName.toLowerCase()}`;
    const email = `${emailPrefix}@schoolerp.com`;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        schoolId,
        roleId,
        email,
        password: defaultPasswordHash,
        name: `${t.firstName} ${t.lastName}`.trim(),
        phone: t.phone,
        status: 'ACTIVE',
      });
    }

    const staffDoc = await Staff.create({
      schoolId,
      userId: user._id,
      employeeId: t.employeeId,
      firstName: t.firstName,
      lastName: t.lastName,
      email,
      phone: t.phone,
      designation: t.designation || 'Subject Educator',
      department: `${t.subjectArea} Department`,
      qualification: t.qualification,
      experienceYears: t.experienceYears,
      isTeachingStaff: true,
      status: 'ACTIVE',
      joiningDate: new Date('2023-06-01'),
    });

    newlyCreatedStaff.push({ ...staffDoc.toObject(), subjectArea: t.subjectArea });
  }

  console.log(`  ✓ Provisioned ${newlyCreatedStaff.length} additional specialist teachers (EMP-2045 to EMP-2080).`);

  // Step 3: Pool all teachers and index by subject specialization
  const allStaff = await Staff.find({ schoolId, isTeachingStaff: true, status: 'ACTIVE' }).lean();
  console.log(`  ✓ Total Active Faculty Pool: ${allStaff.length} teachers.`);

  // Categorize teachers into subject pools
  const subjectTeacherPools = {
    TAM: [],
    ENG: [],
    MATH: [],
    SCI: [],
    'SOC-SCI': [],
    CS: [],
    PET: [],
    VE: [],
    ART: [],
    HIN: [],
    FRE: [],
    GEN: [],
  };

  for (const st of allStaff) {
    // Check if new teacher with explicit subjectArea
    const newMatch = combinedNewTeachers.find((ct) => ct.employeeId === st.employeeId);
    let area = newMatch?.subjectArea;

    if (!area) {
      // Deduce from qualification/designation of existing Class Teachers
      const q = (st.qualification || '').toLowerCase();
      const d = (st.department || '').toLowerCase();
      if (q.includes('math') || d.includes('math')) area = 'MATH';
      else if (q.includes('tamil') || d.includes('tamil')) area = 'TAM';
      else if (q.includes('english') || d.includes('english')) area = 'ENG';
      else if (q.includes('physic') || q.includes('chem') || q.includes('botany') || q.includes('zoolog') || q.includes('science')) area = 'SCI';
      else if (q.includes('history') || q.includes('civic') || q.includes('geograph') || q.includes('social') || q.includes('econom')) area = 'SOC-SCI';
      else if (q.includes('computer') || d.includes('computer')) area = 'CS';
      else if (q.includes('physical') || q.includes('sports') || q.includes('pet')) area = 'PET';
      else area = 'GEN';
    }

    if (subjectTeacherPools[area]) {
      subjectTeacherPools[area].push(st);
    } else {
      subjectTeacherPools.GEN.push(st);
    }
  }

  console.log('\nStep 3: Subject Specialization Faculty Pools:');
  Object.entries(subjectTeacherPools).forEach(([area, list]) => {
    console.log(`  - ${area.padEnd(8, ' ')}: ${list.length} qualified teachers`);
  });

  // Step 4: Execute Assignments
  console.log('\nStep 4: Allocating teachers to subjects across all 44 sections...');
  const assignmentDocs = [];

  // Track allocation index per pool to ensure fair, round-robin load distribution
  const poolCounters = {};
  Object.keys(subjectTeacherPools).forEach((k) => (poolCounters[k] = 0));

  function getNextTeacherForArea(area, preferredTeacher = null) {
    if (preferredTeacher) return preferredTeacher;
    const pool = (subjectTeacherPools[area] && subjectTeacherPools[area].length > 0)
      ? subjectTeacherPools[area]
      : (subjectTeacherPools.GEN.length > 0 ? subjectTeacherPools.GEN : allStaff);

    const idx = poolCounters[area] % pool.length;
    poolCounters[area]++;
    return pool[idx];
  }

  // --- PART A: Pre-KG Sections (Single Teacher for Entire Day & All Subjects) ---
  console.log('  -> Allocating Pre-KG sections (Homeroom Single-Teacher Model)...');
  for (const sec of preKgSections) {
    const classTeacher = sec.classTeacherId;
    if (!classTeacher) {
      console.warn(`    [warn] Pre-KG section "${sec.name}" has no Class Teacher!`);
      continue;
    }

    const currs = gradeSubjectsMap.get(String(sec.gradeId)) || [];
    for (const cs of currs) {
      assignmentDocs.push({
        schoolId,
        academicYearId,
        staffId: classTeacher._id || classTeacher,
        gradeId: sec.gradeId,
        sectionId: sec._id,
        subjectId: cs.subjectId?._id || cs.subjectId,
        isClassTeacher: false, // Class Teacher identity is on Section.classTeacherId
        assignmentType: 'PRIMARY',
        startDate: new Date('2026-06-01'),
        status: 'ACTIVE',
      });
    }
    console.log(`     ✓ Section ${sec.name} (Pre-KG): All ${currs.length} subjects -> ${classTeacher.firstName} ${classTeacher.lastName} (${classTeacher.employeeId})`);
  }

  // --- PART B: 1st to 10th Standard Sections (Subject Specialist Model) ---
  console.log('  -> Allocating 1st–10th Standard sections (Subject Specialist Model)...');

  // Sort sections by Grade sequenceOrder then section name
  standardSections.sort((a, b) => {
    const ga = grades.find((g) => String(g._id) === String(a.gradeId))?.sequenceOrder ?? 0;
    const gb = grades.find((g) => String(g._id) === String(b.gradeId))?.sequenceOrder ?? 0;
    if (ga !== gb) return ga - gb;
    return (a.name || '').localeCompare(b.name || '');
  });

  for (const sec of standardSections) {
    const gradeObj = grades.find((g) => String(g._id) === String(sec.gradeId));
    const gradeName = gradeObj?.name || 'Standard';
    const currs = gradeSubjectsMap.get(String(sec.gradeId)) || [];

    for (const cs of currs) {
      const subject = cs.subjectId;
      const subCode = subject?.code || '';
      const subArea = getSubjectAreaFromCode(subCode);

      // Check if section's Class Teacher specializes in this subject
      let assignedTeacher = null;
      if (sec.classTeacherId) {
        const ctId = String(sec.classTeacherId._id || sec.classTeacherId);
        const ctStaff = allStaff.find((s) => String(s._id) === ctId);
        if (ctStaff) {
          const ctPool = subjectTeacherPools[subArea] || [];
          if (ctPool.some((p) => String(p._id) === String(ctStaff._id))) {
            assignedTeacher = ctStaff; // Homeroom class teacher teaches their own specialty!
          }
        }
      }

      if (!assignedTeacher) {
        assignedTeacher = getNextTeacherForArea(subArea);
      }

      assignmentDocs.push({
        schoolId,
        academicYearId,
        staffId: assignedTeacher._id,
        gradeId: sec.gradeId,
        sectionId: sec._id,
        subjectId: cs.subjectId?._id || cs.subjectId,
        isClassTeacher: false,
        assignmentType: 'PRIMARY',
        startDate: new Date('2026-06-01'),
        status: 'ACTIVE',
      });
    }
  }

  // Insert all assignments in bulk
  console.log(`\nStep 5: Writing ${assignmentDocs.length} TeacherAssignment documents to MongoDB...`);
  const createdAssignments = await TeacherAssignment.insertMany(assignmentDocs);
  console.log(`  ✓ Successfully committed ${createdAssignments.length} TeacherAssignment records.`);

  // Step 6: Workload Distribution Verification
  console.log('\nStep 6: Workload & Allocation Verification:');
  const assignmentCounts = await TeacherAssignment.aggregate([
    { $match: { schoolId } },
    { $group: { _id: '$staffId', totalSubjects: { $sum: 1 } } },
    { $sort: { totalSubjects: -1 } },
  ]);

  console.log(`  - Total Teachers with active assignments: ${assignmentCounts.length}`);
  const maxLoad = assignmentCounts[0]?.totalSubjects || 0;
  const minLoad = assignmentCounts[assignmentCounts.length - 1]?.totalSubjects || 0;
  const avgLoad = Math.round(createdAssignments.length / (assignmentCounts.length || 1));
  console.log(`  - Max Subjects/Sections per Teacher: ${maxLoad}`);
  console.log(`  - Min Subjects/Sections per Teacher: ${minLoad}`);
  console.log(`  - Average Subject Allocations per Teacher: ${avgLoad}`);

  console.log('\n==============================================================================');
  console.log('✓ SUBJECT TEACHER SEEDING & ALLOCATION PIPELINE COMPLETED SUCCESSFULLY!');
  console.log('==============================================================================\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n✗ Fatal Error:', err);
  process.exit(1);
});
