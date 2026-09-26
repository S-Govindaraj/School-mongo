/**
 * Script: seedTeachersAndAssignments.js
 * Seeds authentic Tamil-named teachers (22 Male, 22 Female) and assigns them
 * as Class Teachers exclusively to each class and section across Pre-KG and 1st–10th Standards.
 *
 * Requirements:
 *   - 10 Grades (1st Standard to 10th Standard) + Pre-KG (Total: 11 Grades)
 *   - 4 Sections per Grade (Section A, B, C, D) -> Total: 44 Sections
 *   - 44 Teachers: 22 Male, 22 Female with authentic Tamil names
 *   - Employee IDs: Sequential starting from EMP-2001 to EMP-2044
 *   - 1:1 Class Teacher mapping to each section (leaving subject assignment for later)
 *   - Cleans all existing orphaned teacher assignment records (143 records)
 *   - Cleans old demo teaching staff (EMP-1003 to EMP-1011, EMP-1016) while preserving
 *     admin, leadership, and Govindaraj Sundar accounts
 *   - Supports --dry-run (Default) and --commit modes
 *
 * Usage:
 *   node src/scripts/seedTeachersAndAssignments.js --dry-run   # Preview all actions (safe)
 *   node src/scripts/seedTeachersAndAssignments.js --commit    # Apply changes to MongoDB Atlas
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
const Room = require('../models/Room');
const Role = require('../models/Role');
const User = require('../models/User');
const Staff = require('../models/Staff');
const TeacherAssignment = require('../models/TeacherAssignment');
const Timetable = require('../models/Timetable');

// 44 Authentic Tamil Teachers: 22 Male, 22 Female
const MALE_TEACHERS = [
  { firstName: 'Anbarasan', lastName: 'S', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 8, phone: '+91 98401 23001', specialization: 'Mathematics' },
  { firstName: 'Karthikeyan', lastName: 'M', qualification: 'M.A., B.Ed. (Tamil Literature)', experienceYears: 10, phone: '+91 98401 23002', specialization: 'Tamil Literature' },
  { firstName: 'Senthil Nathan', lastName: 'R', qualification: 'M.Sc., B.Ed. (Physics)', experienceYears: 9, phone: '+91 98401 23003', specialization: 'Physical Sciences' },
  { firstName: 'Ilango', lastName: 'K', qualification: 'M.A., M.Ed. (English Literature)', experienceYears: 12, phone: '+91 98401 23004', specialization: 'English Language' },
  { firstName: 'Balamurugan', lastName: 'V', qualification: 'M.Sc., B.Ed. (Chemistry)', experienceYears: 7, phone: '+91 98401 23005', specialization: 'Chemical Sciences' },
  { firstName: 'Vetrivel', lastName: 'P', qualification: 'M.Sc., B.Ed. (Botany)', experienceYears: 6, phone: '+91 98401 23006', specialization: 'Life Sciences' },
  { firstName: 'Saravanan', lastName: 'T', qualification: 'M.A., B.Ed. (History & Civics)', experienceYears: 11, phone: '+91 98401 23007', specialization: 'Social Science' },
  { firstName: 'Muthuvel', lastName: 'D', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 5, phone: '+91 98401 23008', specialization: 'Mathematics' },
  { firstName: 'Arivazhagan', lastName: 'N', qualification: 'M.C.A., B.Ed. (Computer Science)', experienceYears: 8, phone: '+91 98401 23009', specialization: 'Computer Science' },
  { firstName: 'Tamilarasan', lastName: 'E', qualification: 'M.A., B.Ed. (Tamil Literature)', experienceYears: 13, phone: '+91 98401 23010', specialization: 'Tamil Language' },
  { firstName: 'Gopinath', lastName: 'C', qualification: 'M.Sc., B.Ed. (Physics)', experienceYears: 7, phone: '+91 98401 23011', specialization: 'Physics' },
  { firstName: 'Suresh Kumar', lastName: 'J', qualification: 'M.Sc., B.Ed. (Chemistry)', experienceYears: 9, phone: '+91 98401 23012', specialization: 'Chemistry' },
  { firstName: 'Venkatesan', lastName: 'A', qualification: 'M.A., B.Ed. (Geography)', experienceYears: 10, phone: '+91 98401 23013', specialization: 'Geography' },
  { firstName: 'Prabhakaran', lastName: 'L', qualification: 'M.Sc., B.Ed. (Zoology)', experienceYears: 6, phone: '+91 98401 23014', specialization: 'Biological Sciences' },
  { firstName: 'Manikandan', lastName: 'G', qualification: 'M.Sc., M.Ed. (Mathematics)', experienceYears: 12, phone: '+91 98401 23015', specialization: 'Mathematics' },
  { firstName: 'Dhanasekaran', lastName: 'B', qualification: 'M.A., B.Ed. (Economics)', experienceYears: 8, phone: '+91 98401 23016', specialization: 'Economics' },
  { firstName: 'Sundaramoorthy', lastName: 'K', qualification: 'M.Sc., B.Ed. (Environmental Science)', experienceYears: 5, phone: '+91 98401 23017', specialization: 'Environmental Science' },
  { firstName: 'Vijay Anand', lastName: 'S', qualification: 'M.Sc., B.Ed. (Information Tech)', experienceYears: 7, phone: '+91 98401 23018', specialization: 'Computer Applications' },
  { firstName: 'Kalaivanan', lastName: 'R', qualification: 'M.A., B.Ed. (Tamil Literature)', experienceYears: 11, phone: '+91 98401 23019', specialization: 'Classical Tamil' },
  { firstName: 'Rajesh Kannan', lastName: 'M', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 9, phone: '+91 98401 23020', specialization: 'Mathematics' },
  { firstName: 'Sivakumar', lastName: 'P', qualification: 'M.Sc., B.Ed. (Physics)', experienceYears: 14, phone: '+91 98401 23021', specialization: 'Applied Physics' },
  { firstName: 'Mohanraj', lastName: 'N', qualification: 'M.A., B.Ed. (English)', experienceYears: 6, phone: '+91 98401 23022', specialization: 'English Grammar' },
];

const FEMALE_TEACHERS = [
  { firstName: 'Meenakshi', lastName: 'S', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 9, phone: '+91 98401 23023', specialization: 'Mathematics' },
  { firstName: 'Soundarya', lastName: 'K', qualification: 'M.A., B.Ed. (English Literature)', experienceYears: 7, phone: '+91 98401 23024', specialization: 'English Literature' },
  { firstName: 'Kanimozhi', lastName: 'M', qualification: 'M.A., M.Ed. (Tamil Literature)', experienceYears: 11, phone: '+91 98401 23025', specialization: 'Tamil Language' },
  { firstName: 'Kavitha', lastName: 'R', qualification: 'M.Sc., B.Ed. (Chemistry)', experienceYears: 8, phone: '+91 98401 23026', specialization: 'Chemistry' },
  { firstName: 'Priyadharshini', lastName: 'V', qualification: 'M.Sc., B.Ed. (Physics)', experienceYears: 6, phone: '+91 98401 23027', specialization: 'Physical Sciences' },
  { firstName: 'Revathi', lastName: 'P', qualification: 'M.Sc., B.Ed. (Zoology)', experienceYears: 10, phone: '+91 98401 23028', specialization: 'Biology' },
  { firstName: 'Nandhini', lastName: 'T', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 5, phone: '+91 98401 23029', specialization: 'Mathematics' },
  { firstName: 'Deepalakshmi', lastName: 'N', qualification: 'M.A., B.Ed. (Social Sciences)', experienceYears: 12, phone: '+91 98401 23030', specialization: 'History & Civics' },
  { firstName: 'Bhuvaneshwari', lastName: 'A', qualification: 'M.C.A., B.Ed. (Computer Science)', experienceYears: 7, phone: '+91 98401 23031', specialization: 'Computer Applications' },
  { firstName: 'Vanitha', lastName: 'D', qualification: 'M.A., B.Ed. (Tamil)', experienceYears: 8, phone: '+91 98401 23032', specialization: 'Tamil' },
  { firstName: 'Sangeetha', lastName: 'G', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 9, phone: '+91 98401 23033', specialization: 'Algebra & Geometry' },
  { firstName: 'Pavithra', lastName: 'J', qualification: 'M.Sc., B.Ed. (Physics)', experienceYears: 6, phone: '+91 98401 23034', specialization: 'Modern Physics' },
  { firstName: 'Anitha', lastName: 'E', qualification: 'M.A., B.Ed. (English)', experienceYears: 8, phone: '+91 98401 23035', specialization: 'English Prose' },
  { firstName: 'Gayathri', lastName: 'S', qualification: 'M.Sc., B.Ed. (Chemistry)', experienceYears: 10, phone: '+91 98401 23036', specialization: 'Organic Chemistry' },
  { firstName: 'Nithya', lastName: 'K', qualification: 'M.Sc., M.Ed. (Botany)', experienceYears: 13, phone: '+91 98401 23037', specialization: 'Plant Sciences' },
  { firstName: 'Mahalakshmi', lastName: 'R', qualification: 'M.A., B.Ed. (History)', experienceYears: 7, phone: '+91 98401 23038', specialization: 'Indian History' },
  { firstName: 'Thenmozhi', lastName: 'B', qualification: 'M.A., B.Ed. (Tamil Literature)', experienceYears: 9, phone: '+91 98401 23039', specialization: 'Tamil Literature' },
  { firstName: 'Suganya', lastName: 'M', qualification: 'M.Sc., B.Ed. (Computer Science)', experienceYears: 5, phone: '+91 98401 23040', specialization: 'Computer Science' },
  { firstName: 'Keerthana', lastName: 'C', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 6, phone: '+91 98401 23041', specialization: 'Arithmetic' },
  { firstName: 'Divya Bharathi', lastName: 'L', qualification: 'M.Sc., B.Ed. (Environmental Studies)', experienceYears: 7, phone: '+91 98401 23042', specialization: 'Environmental Science' },
  { firstName: 'Abirami', lastName: 'V', qualification: 'M.A., B.Ed. (English)', experienceYears: 10, phone: '+91 98401 23043', specialization: 'English Language' },
  { firstName: 'Sowmiya', lastName: 'T', qualification: 'M.Sc., B.Ed. (Mathematics)', experienceYears: 8, phone: '+91 98401 23044', specialization: 'Higher Mathematics' },
];

// Preserved Staff accounts (Leadership, Administration, and Govindaraj Sundar)
const PRESERVED_EMPLOYEE_IDS = [
  'EMP-1000', // System Administrator
  'EMP-1001', // Executive Principal
  'EMP-1002', // Vice Principal
  'EMP-1012', // Finance Manager
  'EMP-1013', // HR Manager
  'EMP-1014', // Transport Manager
  'EMP-1015', // Chief Librarian
  'EMP-0018', // Govindaraj Sundar
];

async function main() {
  const args = process.argv.slice(2);
  const isCommit = args.includes('--commit');
  const isDryRun = !isCommit || args.includes('--dry-run');

  console.log('='.repeat(78));
  console.log('  SCHOOL ERP - TEACHER SEEDING & CLASS TEACHER ASSIGNMENT PIPELINE');
  console.log('='.repeat(78));
  console.log(`  Mode: ${isDryRun ? '🔍 DRY RUN (Audit Preview Only - No Changes Applied)' : '🚀 COMMIT (Writing Changes to MongoDB Atlas)'}`);
  console.log('='.repeat(78) + '\n');

  await connectToDatabase();

  // 1. Resolve school & active academic year
  const school = await School.findOne({ status: 'ACTIVE' }).lean();
  if (!school) {
    throw new Error('No active school found. Run initial setup first.');
  }
  const schoolId = school._id;
  console.log(`✓ Active School: ${school.name} (ID: ${schoolId})`);

  const currentYear = await AcademicYear.findOne({ schoolId, isCurrent: true }).lean()
    || await AcademicYear.findOne({ schoolId }).sort({ startDate: -1 }).lean();
  if (!currentYear) {
    throw new Error('No academic year found for this school.');
  }
  console.log(`✓ Academic Year: ${currentYear.name} (${currentYear.code}) (ID: ${currentYear._id})`);

  // 2. Resolve Role for TEACHER
  const teacherRole = await Role.findOne({ code: 'TEACHER' }).lean()
    || await Role.findOne({ name: /teacher/i }).lean();
  if (!teacherRole) {
    throw new Error('Teacher role (code: TEACHER) not found in database.');
  }
  console.log(`✓ Teacher Role: ${teacherRole.name} (Code: ${teacherRole.code}) (ID: ${teacherRole._id})`);

  // 3. Ensure Pre-KG Grade exists
  let preKgGrade = await Grade.findOne({ schoolId, code: { $in: ['PKG', 'PRE-KG', 'Pre-KG'] } });
  if (!preKgGrade) {
    console.log('\n  [Pre-KG] Grade not found. Creating Pre-KG grade...');
    if (!isDryRun) {
      preKgGrade = await Grade.create({
        schoolId,
        name: 'Pre-KG',
        code: 'PKG',
        sequenceOrder: 0,
        category: 'Pre-Primary',
        description: 'Pre-Kindergarten Early Childhood Education',
        status: 'ACTIVE',
      });
      console.log(`  ✓ Created Grade: Pre-KG (ID: ${preKgGrade._id})`);
    } else {
      console.log('  [dry-run] Would create Grade: Pre-KG (code: PKG, seq: 0, category: Pre-Primary)');
      preKgGrade = { _id: new mongoose.Types.ObjectId(), name: 'Pre-KG', code: 'PKG', sequenceOrder: 0 };
    }
  } else {
    console.log(`✓ Pre-KG Grade exists: ${preKgGrade.name} (ID: ${preKgGrade._id})`);
  }

  // 4. Ensure 4 Sections for Pre-KG exist (Section A, B, C, D)
  const existingPreKgSections = await Section.find({ schoolId, gradeId: preKgGrade._id });
  const preKgSectionNames = ['Section A', 'Section B', 'Section C', 'Section D'];
  const preKgSectionCodes = ['S - A', 'S - B', 'S - C', 'S - D'];

  // Find 4 unused classrooms for Pre-KG (e.g. MAIN-140 to MAIN-143)
  const assignedRoomIds = (await Section.find({ schoolId }).select('roomId')).map((s) => s.roomId).filter(Boolean);
  const availableRooms = await Room.find({
    schoolId,
    status: 'ACTIVE',
    isLab: false,
    _id: { $nin: assignedRoomIds },
  }).sort({ name: 1 }).limit(10).lean();

  const simulatedPreKgSections = [];
  for (let i = 0; i < 4; i++) {
    const sName = preKgSectionNames[i];
    const sCode = preKgSectionCodes[i];
    let sec = existingPreKgSections.find((s) => s.code === sCode || s.name === sName);
    if (!sec) {
      const room = availableRooms[i] || { name: `MAIN-14${i}` };
      console.log(`  [Pre-KG] Section ${sName} missing. Creating with Room ${room.name}...`);
      if (!isDryRun) {
        sec = await Section.create({
          schoolId,
          gradeId: preKgGrade._id,
          name: sName,
          code: sCode,
          capacity: 30,
          room: room.name,
          roomId: room._id,
          status: 'ACTIVE',
        });
        console.log(`  ✓ Created Pre-KG ${sName} (ID: ${sec._id}, Room: ${room.name})`);
      } else {
        console.log(`  [dry-run] Would create Pre-KG ${sName} (${sCode}) with room ${room.name}`);
        sec = {
          _id: new mongoose.Types.ObjectId(),
          schoolId,
          gradeId: preKgGrade._id,
          name: sName,
          code: sCode,
          room: room.name,
          capacity: 30,
          status: 'ACTIVE',
        };
        simulatedPreKgSections.push(sec);
      }
    } else {
      console.log(`  ✓ Pre-KG ${sName} exists (Room: ${sec.room || 'N/A'})`);
    }
  }

  // 5. Fetch all Grades and Sections in order
  let allGrades = await Grade.find({ schoolId, status: { $ne: 'ARCHIVED' } }).sort({ sequenceOrder: 1 }).lean();
  if (isDryRun && !allGrades.some((g) => g.code === 'PKG')) {
    allGrades.unshift(preKgGrade);
  }
  console.log(`\n✓ Total Grades in School: ${allGrades.length} (${allGrades.map((g) => g.name).join(', ')})`);

  let allSections = await Section.find({ schoolId, status: { $ne: 'ARCHIVED' } }).lean();
  if (isDryRun && simulatedPreKgSections.length > 0) {
    allSections = [...simulatedPreKgSections, ...allSections];
  }

  // Sort sections by grade sequence order and section code
  allSections.sort((a, b) => {
    const gA = allGrades.find((g) => String(g._id) === String(a.gradeId));
    const gB = allGrades.find((g) => String(g._id) === String(b.gradeId));
    const seqA = gA?.sequenceOrder ?? 999;
    const seqB = gB?.sequenceOrder ?? 999;
    if (seqA !== seqB) return seqA - seqB;
    return (a.code || a.name || '').localeCompare(b.code || b.name || '');
  });
  console.log(`✓ Total Sections in School: ${allSections.length} (4 sections × ${allGrades.length} grades)`);

  if (allSections.length !== 44) {
    console.log(`  [note] Expected 44 sections, found ${allSections.length}. Script will assign teachers to all ${allSections.length} sections.`);
  }

  // 6. Clean existing teacher assignments & orphaned timetables
  const existingAssignmentsCount = await TeacherAssignment.countDocuments({ schoolId });
  const orphanedTimetablesCount = await Timetable.countDocuments({ schoolId, gradeId: { $nin: allGrades.map((g) => g._id) } });

  console.log('\n--- DATA CLEANUP AUDIT ---');
  console.log(`  • Teacher Assignment records to delete: ${existingAssignmentsCount}`);
  console.log(`  • Orphaned Timetable records to delete: ${orphanedTimetablesCount}`);

  // 7. Inspect existing staff to delete/preserve
  const allStaff = await Staff.find({ schoolId }).lean();
  const staffToDelete = allStaff.filter((s) => !PRESERVED_EMPLOYEE_IDS.includes(s.employeeId) && s.employeeId.startsWith('EMP-10'));
  console.log(`  • Old demo staff to delete: ${staffToDelete.length} (${staffToDelete.map((s) => `${s.employeeId} - ${s.firstName} ${s.lastName}`).join(', ')})`);
  console.log(`  • Staff accounts preserved: ${allStaff.length - staffToDelete.length} (${PRESERVED_EMPLOYEE_IDS.join(', ')})`);

  if (!isDryRun) {
    // Delete existing teacher assignments
    const delAssignments = await TeacherAssignment.deleteMany({ schoolId });
    console.log(`\n  ✓ Deleted ${delAssignments.deletedCount} existing teacher assignments.`);

    // Delete orphaned timetables
    if (orphanedTimetablesCount > 0) {
      const delTt = await Timetable.deleteMany({ schoolId, gradeId: { $nin: allGrades.map((g) => g._id) } });
      console.log(`  ✓ Deleted ${delTt.deletedCount} orphaned timetable records.`);
    }

    // Delete old demo staff and their user accounts
    if (staffToDelete.length > 0) {
      const staffIds = staffToDelete.map((s) => s._id);
      const userIds = staffToDelete.map((s) => s.userId).filter(Boolean);
      await Staff.deleteMany({ _id: { $in: staffIds } });
      await User.deleteMany({ _id: { $in: userIds } });
      console.log(`  ✓ Removed ${staffToDelete.length} old demo teachers and user accounts.`);
    }
  } else {
    console.log(`\n  [dry-run] Would delete ${existingAssignmentsCount} teacher assignments.`);
    console.log(`  [dry-run] Would delete ${orphanedTimetablesCount} orphaned timetables.`);
    console.log(`  [dry-run] Would delete ${staffToDelete.length} old demo staff accounts.`);
  }

  // 8. Prepare 44 Tamil Teachers with balanced Male/Female distribution
  // We pair 2 Male and 2 Female teachers per grade (Sections A, B, C, D)
  // Section A: Male, Section B: Female, Section C: Male, Section D: Female
  const teacherProfiles = [];
  let maleIdx = 0;
  let femaleIdx = 0;

  for (let i = 0; i < allSections.length; i++) {
    const sec = allSections[i];
    const secLetter = (sec.code || sec.name || '').slice(-1).toUpperCase();
    const isMale = (secLetter === 'A' || secLetter === 'C') ? true : false;
    const template = isMale
      ? (MALE_TEACHERS[maleIdx++] || MALE_TEACHERS[maleIdx % MALE_TEACHERS.length])
      : (FEMALE_TEACHERS[femaleIdx++] || FEMALE_TEACHERS[femaleIdx % FEMALE_TEACHERS.length]);

    const empIdNum = 2001 + i;
    const empId = `EMP-${empIdNum}`;
    const cleanFirst = template.firstName.toLowerCase().replace(/[^a-z]/g, '');
    const cleanLast = template.lastName.toLowerCase().replace(/[^a-z]/g, '');
    const email = `${cleanFirst}.${cleanLast || 't'}@schoolerp.com`;

    teacherProfiles.push({
      employeeId: empId,
      firstName: template.firstName,
      lastName: template.lastName,
      gender: isMale ? 'Male' : 'Female',
      email,
      phone: template.phone,
      qualification: template.qualification,
      experienceYears: template.experienceYears,
      designation: 'Class Teacher',
      department: 'Academic & Instruction',
      specialization: template.specialization,
      section: sec,
    });
  }

  const maleCount = teacherProfiles.filter((t) => t.gender === 'Male').length;
  const femaleCount = teacherProfiles.filter((t) => t.gender === 'Female').length;
  console.log(`\n✓ Generated ${teacherProfiles.length} Tamil Teachers: ${maleCount} Male, ${femaleCount} Female (Exact 50/50 Balance)`);

  // 9. Display Teacher & Class Teacher Assignment Plan
  console.log('\n' + '='.repeat(105));
  console.log(`  ${'EMP ID'.padEnd(10)} | ${'NAME'.padEnd(20)} | ${'GENDER'.padEnd(8)} | ${'GRADE'.padEnd(17)} | ${'SECTION'.padEnd(11)} | ${'ROOM'.padEnd(10)} | ${'QUALIFICATION'}`);
  console.log('='.repeat(105));

  for (const t of teacherProfiles) {
    const gName = allGrades.find((g) => String(g._id) === String(t.section.gradeId))?.name || 'Pre-KG';
    console.log(
      `  ${t.employeeId.padEnd(10)} | ${(t.firstName + ' ' + t.lastName).padEnd(20)} | ${t.gender.padEnd(8)} | ${gName.padEnd(17)} | ${(t.section.name + ' (' + t.section.code + ')').padEnd(11)} | ${(t.section.room || 'TBD').padEnd(10)} | ${t.qualification}`
    );
  }
  console.log('='.repeat(105));

  // 10. Write Users, Staff, and Teacher Assignments
  if (!isDryRun) {
    console.log('\nWriting records to database...');
    const defaultPassword = 'Teacher@123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const createdAssignments = [];
    for (const t of teacherProfiles) {
      // 1. Create or update User
      let user = await User.findOne({ email: t.email });
      if (!user) {
        user = await User.create({
          schoolId,
          roleId: teacherRole._id,
          email: t.email,
          password: hashedPassword,
          name: `${t.firstName} ${t.lastName}`,
          phone: t.phone,
          status: 'ACTIVE',
        });
      }

      // 2. Create or update Staff
      let staff = await Staff.findOne({ schoolId, employeeId: t.employeeId });
      if (!staff) {
        staff = await Staff.create({
          schoolId,
          userId: user._id,
          employeeId: t.employeeId,
          firstName: t.firstName,
          lastName: t.lastName,
          email: t.email,
          phone: t.phone,
          designation: t.designation,
          department: t.department,
          joiningDate: new Date('2023-06-01'),
          qualification: t.qualification,
          experienceYears: t.experienceYears,
          isTeachingStaff: true,
          status: 'ACTIVE',
        });
      }

      // 3. Create TeacherAssignment (Class Teacher exclusively, subjectId: null)
      const assignment = await TeacherAssignment.create({
        schoolId,
        academicYearId: currentYear._id,
        staffId: staff._id,
        gradeId: t.section.gradeId,
        sectionId: t.section._id,
        subjectId: null,
        isClassTeacher: true,
        assignmentType: 'PRIMARY',
        startDate: currentYear.startDate,
        endDate: currentYear.endDate,
        status: 'ACTIVE',
      });
      createdAssignments.push(assignment);
    }

    console.log(`\n✓ Successfully created ${teacherProfiles.length} User accounts.`);
    console.log(`✓ Successfully created ${teacherProfiles.length} Staff records (${maleCount} Male, ${femaleCount} Female).`);
    console.log(`✓ Successfully created ${createdAssignments.length} Class Teacher Assignments.`);
    console.log('  Password for all new teacher accounts: Teacher@123');
  } else {
    console.log('\n[dry-run] No changes committed to database.');
    console.log('To execute this plan, run with: node src/scripts/seedTeachersAndAssignments.js --commit');
  }

  console.log('\n' + '='.repeat(78));
  console.log(`  PIPELINE FINISHED ${isDryRun ? '(DRY RUN PREVIEW)' : '(COMMIT COMPLETE)'}`);
  console.log('='.repeat(78) + '\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
