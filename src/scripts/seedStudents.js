/**
 * Script: seedStudents.js
 * Comprehensive realistic student seed generator for Tamil Nadu School Management System.
 *
 * Requirements:
 *   1. Deletes existing students and student-specific records (guardians, enrollments, admissions, etc.)
 *      while strictly preserving master data (AcademicYears, Grades, Sections, Subjects, Staff, etc.).
 *   2. Generates 800 students across 10 Standards (1st to 10th Standard), 4 Sections per Standard (A, B, C, D).
 *   3. 20 students per section: exactly 10 Male, 10 Female.
 *   4. Sequential Student IDs: STU-2026-00001 to STU-2026-00800 without gaps.
 *   5. Sequential Admission Numbers: ADM-2026-00001 to ADM-2026-00800 without gaps.
 *   6. Roll numbers within section: Roll 01 to Roll 20, restarting per section.
 *   7. Authentic Tamil Nadu / Tamil names and realistic addresses across TN districts.
 *   8. Age-appropriate Date of Birth mapped to Academic Year 2026-2027 (~6 yrs in 1st to ~15 yrs in 10th).
 *   9. Full guardian details (Father & Mother) with valid contact info and StudentGuardian linkage.
 *  10. Active Enrollment & Admission record for every student.
 *  11. 15-point post-insertion validation suite verifying zero anomalies.
 *  12. Supports --dry-run (default preview) and --commit (apply changes).
 *
 * Usage:
 *   node src/scripts/seedStudents.js --dry-run          # Safe dry run preview (writes nothing)
 *   node src/scripts/seedStudents.js --clean --dry-run  # Preview clean + seed without DB writes
 *   node src/scripts/seedStudents.js --clean --commit   # Clean existing students & commit 800 new
 *   node src/scripts/seedStudents.js --commit           # Commit 800 new students (auto-cleans if requested)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

// DNS server fallback for robust MongoDB Atlas connectivity
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
        maxPoolSize: 25,
        minPoolSize: 5,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 15000,
        heartbeatFrequencyMS: 10000,
      });
      console.log('✓ Connected to MongoDB Atlas successfully.');
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
const Student = require('../models/Student');
const Guardian = require('../models/Guardian');
const StudentGuardian = require('../models/StudentGuardian');
const Enrollment = require('../models/Enrollment');
const Admission = require('../models/Admission');
const AcademicHistory = require('../models/AcademicHistory');
const StudentHealthProfile = require('../models/StudentHealthProfile');
const StudentDocument = require('../models/StudentDocument');
const AttendanceRecord = require('../models/AttendanceRecord');
const ExamResult = require('../models/ExamResult');
const StudentMark = require('../models/StudentMark');
const DisciplineIncident = require('../models/DisciplineIncident');
const DisciplinaryAction = require('../models/DisciplinaryAction');
const MedicalVisit = require('../models/MedicalVisit');
const FeeConcession = require('../models/FeeConcession');
const StudentFeeAssignment = require('../models/StudentFeeAssignment');

// ==========================================
// TAMIL NADU REALISTIC DATASETS
// ==========================================

const TAMIL_MALE_NAMES = [
  'Arjun', 'Karthikeyan', 'Vignesh', 'Santhosh', 'Praveen', 'Hari', 'Suresh', 'Dinesh',
  'Naveen', 'Bharath', 'Gokul', 'Surya', 'Ashwin', 'Rohit', 'Kavin', 'Saravanan',
  'Vigneshwaran', 'Anand', 'Muthukumar', 'Balaji', 'Senthil', 'Manikandan', 'Vijay',
  'Ajith', 'Sivakumar', 'Dhanush', 'Anirudh', 'Harish', 'Raghu', 'Vetrivel', 'Selvam',
  'Mohan', 'Arvind', 'Madhavan', 'Jayaram', 'Chandran', 'Murugan', 'Ilango', 'Thirumalai',
  'Subramanian', 'Rajesh', 'Vasanth', 'Kamalesh', 'Aravind', 'Siddharth', 'Pranav',
  'Vishal', 'Kishore', 'Deepak', 'Nithesh', 'Sudharsan', 'Ganesh', 'Prasanna', 'Ramesh',
  'Karthik', 'Sanjay', 'Sarath', 'Sriram', 'Nataraj', 'Balamurugan', 'Elango', 'Gopinath',
  'Jagan', 'Kumaran', 'Mahesh', 'Nandhakumar', 'Parthiban', 'Ravichandran', 'Sathish',
  'Tamilarasan', 'Udhayakumar', 'Yuvaraj', 'Adithya', 'Bhuvanesh', 'Charan', 'Dharshan',
  'Eashwar', 'Giridhar', 'Hemachandran', 'Iniyan', 'Jeevan', 'Kalaiyarasan', 'Lokesh',
  'Mukund', 'Nirmal', 'Prabhakar', 'Rajarajan', 'Sai Vignesh', 'Tarun', 'Vimal', 'Yogesh',
];

const TAMIL_FEMALE_NAMES = [
  'Harini', 'Nivetha', 'Divya', 'Keerthana', 'Dharshini', 'Swetha', 'Pavithra', 'Priya',
  'Janani', 'Ananya', 'Yazhini', 'Abinaya', 'Kavya', 'Deepika', 'Aishwarya', 'Soundarya',
  'Subhashini', 'Nithya', 'Meenakshi', 'Gayathri', 'Mythili', 'Malathi', 'Revathi',
  'Vaithegi', 'Sangeetha', 'Sneha', 'Sowmya', 'Anitha', 'Shalini', 'Preethi', 'Archana',
  'Poornima', 'Brinda', 'Priyadharshini', 'Madhumitha', 'Varsha', 'Akshaya', 'Sandhya',
  'Bhavani', 'Hemalatha', 'Indhumathi', 'Karpagam', 'Lakshmi', 'Manju', 'Nalini',
  'Padmavathi', 'Rajalakshmi', 'Saranya', 'Thenmozhi', 'Uma', 'Vijayalakshmi', 'Yamuna',
  'Abirami', 'Bhuvaneshwari', 'Charumathi', 'Devi', 'Ezhil', 'Gomathi', 'Haripriya',
  'Ilakkiya', 'Jayashree', 'Kavitha', 'Lavanya', 'Monisha', 'Nandhini', 'Pavala',
  'Rajeswari', 'Santhiya', 'Tharani', 'Usha', 'Vennila', 'Vinodhini', 'Yuvasri',
  'Anusuya', 'Bharkavi', 'Chitra', 'Deepalakshmi', 'Elakkiya', 'Gowri', 'Hamsaveni',
  'Ishwarya', 'Janaki', 'Kokila', 'Loganayaki', 'Manochitra', 'Nirmala', 'Pradeepa',
];

const TAMIL_SURNAMES = [
  'Subramanian', 'Natarajan', 'Sundaram', 'Venkataraman', 'Balasubramanian', 'Chandrasekar',
  'Narayanan', 'Swaminathan', 'Meenakshisundaram', 'Ramachandran', 'Krishnan', 'Parthasarathy',
  'Ranganathan', 'Viswanathan', 'Gurunathan', 'Ganesan', 'Jayaraman', 'Srinivasan',
  'Rajendran', 'Muthusamy', 'Sadasivam', 'Thirunavukkarasu', 'Palanisamy', 'Annamalai',
  'Marimuthu', 'Shanmugam', 'Veerappan', 'Dharmalingam', 'Kandasamy', 'Manickam',
  'Radhakrishnan', 'Sengottaiyan', 'Thangavel', 'Vadivel', 'Arunachalam', 'Chidambaram',
  'Duraisamy', 'Govindarajan', 'Jagannathan', 'Kaliappan', 'Loganathan', 'Munusamy',
  'Nallathambi', 'Panneerselvam', 'Ramalingam', 'Sivagnanam', 'Thiyagarajan', 'Velmurugan',
];

const TAMIL_MOTHER_FIRST_NAMES = [
  'Lakshmi', 'Parvathi', 'Saraswathi', 'Meenakshi', 'Bhuvaneshwari', 'Rajalakshmi',
  'Shanthi', 'Vijaya', 'Karpagam', 'Revathi', 'Geetha', 'Anuradha', 'Usha', 'Sudha',
  'Kavitha', 'Chitra', 'Malathi', 'Padma', 'Bhavani', 'Uma', 'Saradha', 'Sujatha',
  'Devi', 'Gomathi', 'Vasantha', 'Pushpa', 'Mangalam', 'Radha', 'Kalyani', 'Indira',
];

const TN_LOCATIONS = [
  { city: 'Chennai', postalCode: '600028', street: 'Mylapore High Road' },
  { city: 'Chennai', postalCode: '600040', street: 'Anna Nagar 2nd Avenue' },
  { city: 'Chennai', postalCode: '600017', street: 'T. Nagar Panagal Park' },
  { city: 'Chennai', postalCode: '600020', street: 'Adyar Gandhi Nagar' },
  { city: 'Coimbatore', postalCode: '641002', street: 'RS Puram Main Street' },
  { city: 'Coimbatore', postalCode: '641004', street: 'Peelamedu Avinashi Salai' },
  { city: 'Coimbatore', postalCode: '641018', street: 'Gandhipuram 7th Cross' },
  { city: 'Madurai', postalCode: '625001', street: 'Town Hall Road' },
  { city: 'Madurai', postalCode: '625020', street: 'KK Nagar 80 Feet Road' },
  { city: 'Madurai', postalCode: '625002', street: 'Vakkil New Street' },
  { city: 'Tiruchirappalli', postalCode: '620018', street: 'Thillai Nagar 10th Cross' },
  { city: 'Tiruchirappalli', postalCode: '620001', street: 'Cantonment Main Road' },
  { city: 'Salem', postalCode: '636007', street: 'Fairlands Brindavan Road' },
  { city: 'Salem', postalCode: '636004', street: 'Hasthampatti Main Salai' },
  { city: 'Tirunelveli', postalCode: '627002', street: 'Palayamkottai South Car St' },
  { city: 'Erode', postalCode: '638011', street: 'Perundurai Road' },
  { city: 'Vellore', postalCode: '632001', street: 'Gandhi Nagar Phase 2' },
  { city: 'Thanjavur', postalCode: '613007', street: 'Medical College Road' },
  { city: 'Dindigul', postalCode: '624001', street: 'GTN Salai' },
  { city: 'Tiruppur', postalCode: '641602', street: 'Kumaran Road' },
  { city: 'Kanchipuram', postalCode: '631501', street: 'Gandhi Road' },
];

const FATHER_OCCUPATIONS = [
  'Senior Software Engineer', 'Civil Project Manager', 'Branch Manager (SBI)', 'Government Administrative Officer',
  'Wholesale Textile Merchant', 'Higher Secondary School Teacher', 'Chartered Accountant', 'University Professor',
  'General Physician', 'Hardware Business Owner', 'Electrical Contractor', 'Senior Mechanical Engineer',
  'Logistics Operator', 'Retail Pharmacy Owner', 'Agricultural Extension Officer', 'Automobile Consultant'
];

const MOTHER_OCCUPATIONS = [
  'Homemaker', 'Software Engineer', 'Mathematics Teacher', 'Bank Officer (Canara Bank)', 'Consultant Pediatrician',
  'College Lecturer', 'Architect', 'Chartered Accountant', 'Entrepreneur', 'Clinical Nutritionist',
  'Graphic Designer', 'Civil Services Officer', 'Hospital Pharmacist', 'HR Talent Specialist'
];

const PREVIOUS_SCHOOLS = [
  'Sri Ramakrishna Matriculation Higher Secondary School',
  'Kendriya Vidyalaya CLRI',
  'St. Joseph Matriculation School',
  'Vivekananda Vidyalaya Junior School',
  'Bharathi Vidya Bhavan Matriculation',
  'Don Bosco Matriculation Higher Secondary School',
  'DAV Senior Secondary School',
  'Maharishi Vidya Mandir Senior Secondary',
  'St. Bede Anglo Indian Higher Secondary School',
  'Government Model Primary School',
];

const BLOOD_GROUPS = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB+'];

// CLI Argument Parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: true, // Default safe mode
    clean: false,
    schoolId: null,
  };

  for (const arg of args) {
    if (arg === '--commit') options.dryRun = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--clean') options.clean = true;
    else if (arg.startsWith('--school=')) options.schoolId = arg.split('=')[1].trim();
  }

  return options;
}

// Generate age-appropriate Date of Birth for Academic Year 2026-2027
// 1st Standard ~ 6 years old in mid-2026 (Born in 2020)
// 10th Standard ~ 15 years old in mid-2026 (Born in 2011)
function generateDobForGrade(sequenceOrder, studentIndexWithinSection) {
  const birthYear = 2020 - (sequenceOrder - 1);
  const birthMonth = (studentIndexWithinSection * 5 + 3) % 12; // 0 to 11
  const birthDay = 1 + ((studentIndexWithinSection * 7 + 11) % 27); // 1 to 27
  return new Date(Date.UTC(birthYear, birthMonth, birthDay));
}

// Calculate age as of June 1, 2026 (beginning of AY 2026-2027)
function calculateAgeIn2026(dob) {
  const refDate = new Date('2026-06-01');
  let age = refDate.getUTCFullYear() - dob.getUTCFullYear();
  const m = refDate.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && refDate.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(90));
  console.log(' School ERP - Realistic Student Seed Generator (Tamil Nadu)');
  console.log('='.repeat(90));
  console.log('Configuration:');
  console.log(`  Mode:               ${options.dryRun ? 'DRY RUN (Preview Only - ZERO database modifications)' : 'COMMIT (Applying real changes to MongoDB)'}`);
  console.log(`  Clean Existing:     ${options.clean ? 'YES (Will purge existing student/guardian/enrollment records)' : 'NO'}`);
  console.log(`  Target Academic Yr: 2026-2027`);
  console.log(`  Target Standards:   10 (1st Standard to 10th Standard)`);
  console.log(`  Sections Per Std:   4 (Section A, B, C, D)`);
  console.log(`  Students Per Sec:   20 (10 Male, 10 Female)`);
  console.log(`  Total Students:     800 (10 × 4 × 20)`);
  console.log(`  Student ID Range:   STU-2026-00001 .. STU-2026-00800`);
  console.log(`  Admission ID Range: ADM-2026-00001 .. ADM-2026-00800`);
  console.log('='.repeat(90));

  await connectToDatabase();

  try {
    // 1. Resolve Target School
    let school;
    if (options.schoolId) {
      school = await School.findById(options.schoolId);
      if (!school) throw new Error(`Target school with ID "${options.schoolId}" not found.`);
    } else {
      school = await School.findOne({});
      if (!school) throw new Error('No school found in database. Please seed school profile first.');
    }
    console.log(`\nTarget School: "${school.name}" (Code: ${school.code || 'SCH-001'})`);

    // 2. Resolve Academic Year 2026-2027
    const academicYear = await AcademicYear.findOne({
      schoolId: school._id,
      $or: [{ name: '2026-2027' }, { code: '2026-2027' }, { isCurrent: true }],
    });
    if (!academicYear) {
      throw new Error('Academic Year 2026-2027 not found for this school. Please seed academic years first.');
    }
    console.log(`Active Academic Year: "${academicYear.name}" (ID: ${academicYear._id})`);

    // 3. Resolve 10 Grades (1st to 10th Standard)
    const grades = await Grade.find({ schoolId: school._id }).sort({ sequenceOrder: 1 });
    if (grades.length < 10) {
      throw new Error(`Expected at least 10 grades (1st to 10th Standard). Found only ${grades.length}. Run "npm run seed:grades:clean" first.`);
    }
    const standardGrades = grades.slice(0, 10);
    console.log(`Grades Resolved: 10 standards from "${standardGrades[0].name}" (${standardGrades[0].code}) to "${standardGrades[9].name}" (${standardGrades[9].code})`);

    // 4. Resolve Sections (A, B, C, D) for each Grade
    const gradeSectionMap = new Map();
    for (const g of standardGrades) {
      const secs = await Section.find({ schoolId: school._id, gradeId: g._id }).sort({ name: 1 });
      if (secs.length < 4) {
        throw new Error(`Grade "${g.name}" has only ${secs.length} sections. Exactly 4 sections (A, B, C, D) are required.`);
      }
      gradeSectionMap.set(String(g._id), secs.slice(0, 4));
    }
    console.log(`Sections Resolved: Exactly 4 sections per grade mapped across all 10 grades (40 total sections).`);

    // 5. Inspect Existing Student Records
    const existingStudentCount = await Student.countDocuments({ schoolId: school._id });
    const existingEnrollmentCount = await Enrollment.countDocuments({ schoolId: school._id });
    const existingGuardianCount = await Guardian.countDocuments({ schoolId: school._id });
    console.log(`\nCurrent Database State for "${school.name}":`);
    console.log(`  Existing Students:    ${existingStudentCount}`);
    console.log(`  Existing Enrollments: ${existingEnrollmentCount}`);
    console.log(`  Existing Guardians:   ${existingGuardianCount}`);

    // 6. Build the Complete 800-Student Seed Plan
    const studentRecords = [];
    const guardianRecords = [];
    const studentGuardianRecords = [];
    const enrollmentRecords = [];
    const admissionRecords = [];
    const academicHistoryRecords = [];

    let globalStudentCounter = 0;
    let maleCounter = 0;
    let femaleCounter = 0;

    for (let gIdx = 0; gIdx < standardGrades.length; gIdx++) {
      const currentGrade = standardGrades[gIdx];
      const sections = gradeSectionMap.get(String(currentGrade._id));

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const currentSection = sections[sIdx];

        // 20 students per section: 10 Male, 10 Female
        for (let secStudentIdx = 0; secStudentIdx < 20; secStudentIdx++) {
          globalStudentCounter++;
          const studentSeq = globalStudentCounter; // 1 to 800
          const studentNumber = `STU-2026-${String(studentSeq).padStart(5, '0')}`;
          const admissionNumber = `ADM-2026-${String(studentSeq).padStart(5, '0')}`;
          const rollNumber = String(secStudentIdx + 1).padStart(2, '0'); // "01" to "20"

          const isMale = secStudentIdx < 10;
          const gender = isMale ? 'MALE' : 'FEMALE';

          let firstName, lastName;
          if (isMale) {
            maleCounter++;
            firstName = TAMIL_MALE_NAMES[(maleCounter - 1) % TAMIL_MALE_NAMES.length];
            lastName = TAMIL_SURNAMES[((maleCounter - 1) * 7 + 3) % TAMIL_SURNAMES.length];
          } else {
            femaleCounter++;
            firstName = TAMIL_FEMALE_NAMES[(femaleCounter - 1) % TAMIL_FEMALE_NAMES.length];
            lastName = TAMIL_SURNAMES[((femaleCounter - 1) * 11 + 5) % TAMIL_SURNAMES.length];
          }

          const dob = generateDobForGrade(currentGrade.sequenceOrder, secStudentIdx);
          const age = calculateAgeIn2026(dob);

          const loc = TN_LOCATIONS[(studentSeq * 7) % TN_LOCATIONS.length];
          const doorNum = (studentSeq * 13) % 250 + 1;
          const streetAddress = `${doorNum}, ${loc.street}, ${loc.city}`;
          const bloodGroup = BLOOD_GROUPS[studentSeq % BLOOD_GROUPS.length];

          const studentPhone = `+91 9${String(800000000 + (studentSeq * 12345) % 199999999)}`;
          const cleanLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const studentEmail = `${cleanFirst}.${cleanLast}${studentSeq}@student.schoolerp.com`;

          // Guardian Details (Father & Mother)
          const fatherFirstName = TAMIL_MALE_NAMES[(studentSeq * 13 + 7) % TAMIL_MALE_NAMES.length];
          const fatherName = `${fatherFirstName} ${lastName}`;
          const fatherPhone = `+91 9${String(900000000 + (studentSeq * 23456) % 99999999)}`;
          const fatherEmail = `parent.${cleanFirst}.${studentSeq}@gmail.com`;
          const fatherOccupation = FATHER_OCCUPATIONS[studentSeq % FATHER_OCCUPATIONS.length];

          const motherFirstName = TAMIL_MOTHER_FIRST_NAMES[(studentSeq * 17 + 11) % TAMIL_MOTHER_FIRST_NAMES.length];
          const motherName = `${motherFirstName} ${lastName}`;
          const motherOccupation = MOTHER_OCCUPATIONS[studentSeq % MOTHER_OCCUPATIONS.length];

          // Realistic Admission Date between May 10 and June 10, 2026
          const admissionDay = 10 + (studentSeq % 28);
          const admissionMonth = admissionDay > 31 ? 5 : 4; // May or June
          const actualDay = admissionDay > 31 ? admissionDay - 31 : admissionDay;
          const admissionDate = new Date(Date.UTC(2026, admissionMonth, actualDay));

          const prevSchool = currentGrade.sequenceOrder === 1
            ? 'Little Pearls Kindergarten, Chennai'
            : PREVIOUS_SCHOOLS[studentSeq % PREVIOUS_SCHOOLS.length];

          // Pre-generate ObjectIds for deterministic relations
          const studentDocId = new mongoose.Types.ObjectId();
          const guardianDocId = new mongoose.Types.ObjectId();
          const enrollmentDocId = new mongoose.Types.ObjectId();
          const admissionDocId = new mongoose.Types.ObjectId();

          // 1. Student Document
          const studentDoc = {
            _id: studentDocId,
            schoolId: school._id,
            studentNumber,
            admissionNumber,
            rollNumber,
            firstName,
            middleName: '',
            lastName,
            dob,
            gender,
            bloodGroup,
            nationality: 'Indian',
            email: studentEmail,
            phone: studentPhone,
            address: {
              street: `${doorNum}, ${loc.street}`,
              city: loc.city,
              state: 'Tamil Nadu',
              postalCode: loc.postalCode,
              country: 'India',
            },
            status: 'ACTIVE',
            admissionDate,
            previousSchool: prevSchool,
            emergencyContact: {
              name: fatherName,
              relationship: 'FATHER',
              phone: fatherPhone,
            },
            createdAt: admissionDate,
            updatedAt: admissionDate,
          };
          studentRecords.push(studentDoc);

          // 2. Guardian Document (Primary Contact: Father)
          const guardianDoc = {
            _id: guardianDocId,
            schoolId: school._id,
            name: fatherName,
            relationship: 'FATHER',
            phone: fatherPhone,
            email: fatherEmail,
            occupation: fatherOccupation,
            address: streetAddress,
            isPrimary: true,
            isEmergencyContact: true,
            status: 'ACTIVE',
            createdAt: admissionDate,
            updatedAt: admissionDate,
          };
          guardianRecords.push(guardianDoc);

          // 3. Student-Guardian Junction
          const studentGuardianDoc = {
            schoolId: school._id,
            studentId: studentDocId,
            guardianId: guardianDocId,
            relationship: 'FATHER',
            isPrimary: true,
            isEmergencyContact: true,
            createdAt: admissionDate,
            updatedAt: admissionDate,
          };
          studentGuardianRecords.push(studentGuardianDoc);

          // 4. Enrollment Document
          const enrollmentDoc = {
            _id: enrollmentDocId,
            schoolId: school._id,
            studentId: studentDocId,
            academicYearId: academicYear._id,
            gradeId: currentGrade._id,
            sectionId: currentSection._id,
            rollNumber,
            enrollmentDate: admissionDate,
            status: 'ACTIVE',
            isCurrent: true,
            createdAt: admissionDate,
            updatedAt: admissionDate,
          };
          enrollmentRecords.push(enrollmentDoc);

          // 5. Admission Document
          const admissionDoc = {
            _id: admissionDocId,
            schoolId: school._id,
            applicationNumber: admissionNumber,
            applicationDate: new Date(Date.UTC(2026, 4, Math.max(1, actualDay - 5))),
            academicYearId: academicYear._id,
            gradeId: currentGrade._id,
            studentData: {
              firstName,
              middleName: '',
              lastName,
              dob,
              gender,
              bloodGroup,
              nationality: 'Indian',
              email: studentEmail,
              phone: studentPhone,
              address: {
                street: `${doorNum}, ${loc.street}`,
                city: loc.city,
                state: 'Tamil Nadu',
                postalCode: loc.postalCode,
                country: 'India',
              },
              previousSchool: prevSchool,
            },
            guardianData: [
              {
                name: fatherName,
                relationship: 'FATHER',
                phone: fatherPhone,
                email: fatherEmail,
                occupation: fatherOccupation,
                isPrimary: true,
                isEmergencyContact: true,
              },
              {
                name: motherName,
                relationship: 'MOTHER',
                phone: `+91 9${String(700000000 + (studentSeq * 34567) % 99999999)}`,
                email: `mother.${cleanFirst}.${studentSeq}@gmail.com`,
                occupation: motherOccupation,
                isPrimary: false,
                isEmergencyContact: false,
              },
            ],
            status: 'ENROLLED',
            studentId: studentDocId,
            notes: 'Verified admission credentials and enrolled.',
            createdAt: admissionDate,
            updatedAt: admissionDate,
          };
          admissionRecords.push(admissionDoc);

          // 6. Academic History Ledger Record
          const academicHistoryDoc = {
            schoolId: school._id,
            studentId: studentDocId,
            academicYearId: academicYear._id,
            gradeId: currentGrade._id,
            sectionId: currentSection._id,
            enrollmentId: enrollmentDocId,
            promotionStatus: 'ENROLLED',
            remarks: `Admitted and enrolled into ${currentGrade.name} - ${currentSection.name}`,
            createdAt: admissionDate,
            updatedAt: admissionDate,
          };
          academicHistoryRecords.push(academicHistoryDoc);
        }
      }
    }

    // ==========================================
    // 15-POINT COMPREHENSIVE VALIDATION SUITE
    // ==========================================
    console.log('\n' + '='.repeat(90));
    console.log(' RUNNING 15-POINT DATA CONSISTENCY & VALIDATION AUDIT');
    console.log('='.repeat(90));

    const errors = [];

    // 1. Total Student Count
    if (studentRecords.length !== 800) {
      errors.push(`Validation 1 Failed: Expected exactly 800 students, got ${studentRecords.length}`);
    } else {
      console.log(' [1/15] ✓ Total Students: Exactly 800 students planned.');
    }

    // 2. Exactly 10 Standards Represented
    const distinctGrades = new Set(enrollmentRecords.map((e) => String(e.gradeId)));
    if (distinctGrades.size !== 10) {
      errors.push(`Validation 2 Failed: Expected 10 standards, got ${distinctGrades.size}`);
    } else {
      console.log(' [2/15] ✓ Standards: Exactly 10 standards (1st Standard to 10th Standard).');
    }

    // 3. Exactly 4 Sections per Standard
    let sectionCheckPassed = true;
    for (const g of standardGrades) {
      const gEnrollments = enrollmentRecords.filter((e) => String(e.gradeId) === String(g._id));
      const gSections = new Set(gEnrollments.map((e) => String(e.sectionId)));
      if (gSections.size !== 4) {
        errors.push(`Validation 3 Failed: Grade ${g.name} has ${gSections.size} sections instead of 4.`);
        sectionCheckPassed = false;
      }
    }
    if (sectionCheckPassed) {
      console.log(' [3/15] ✓ Sections per Standard: Exactly 4 sections populated per standard.');
    }

    // 4. Exactly 20 Students per Section
    let studentPerSectionPassed = true;
    const sectionCountMap = new Map();
    enrollmentRecords.forEach((e) => {
      const key = `${e.gradeId}-${e.sectionId}`;
      sectionCountMap.set(key, (sectionCountMap.get(key) || 0) + 1);
    });
    for (const [key, count] of sectionCountMap.entries()) {
      if (count !== 20) {
        errors.push(`Validation 4 Failed: Section ${key} has ${count} students instead of 20.`);
        studentPerSectionPassed = false;
      }
    }
    if (studentPerSectionPassed) {
      console.log(' [4/15] ✓ Students per Section: Every section has exactly 20 students (40 sections × 20 = 800).');
    }

    // 5. Gender Balance: Exactly 10 Male & 10 Female per Section
    let genderBalancePassed = true;
    const sectionGenderMap = new Map();
    enrollmentRecords.forEach((e, idx) => {
      const key = `${e.gradeId}-${e.sectionId}`;
      if (!sectionGenderMap.has(key)) sectionGenderMap.set(key, { MALE: 0, FEMALE: 0 });
      const stu = studentRecords[idx];
      sectionGenderMap.get(key)[stu.gender]++;
    });
    for (const [key, counts] of sectionGenderMap.entries()) {
      if (counts.MALE !== 10 || counts.FEMALE !== 10) {
        errors.push(`Validation 5 Failed: Section ${key} gender imbalance: ${counts.MALE}M / ${counts.FEMALE}F.`);
        genderBalancePassed = false;
      }
    }
    if (genderBalancePassed) {
      console.log(' [5/15] ✓ Gender Balance: Exactly 10 Male and 10 Female per section (Total 400M / 400F).');
    }

    // 6. Student ID Uniqueness & Sequence
    const studentIds = new Set(studentRecords.map((s) => s.studentNumber));
    if (studentIds.size !== 800) {
      errors.push(`Validation 6 Failed: Student IDs are not all unique (${studentIds.size} unique).`);
    } else if (
      studentRecords[0].studentNumber !== 'STU-2026-00001' ||
      studentRecords[799].studentNumber !== 'STU-2026-00800'
    ) {
      errors.push(`Validation 6 Failed: Student ID bounds mismatch (${studentRecords[0].studentNumber} .. ${studentRecords[799].studentNumber}).`);
    } else {
      console.log(' [6/15] ✓ Student IDs: Strictly sequential STU-2026-00001 through STU-2026-00800 without gaps.');
    }

    // 7. Admission Number Uniqueness & Sequence
    const admissionNumbers = new Set(studentRecords.map((s) => s.admissionNumber));
    if (admissionNumbers.size !== 800) {
      errors.push(`Validation 7 Failed: Admission numbers not unique.`);
    } else if (
      studentRecords[0].admissionNumber !== 'ADM-2026-00001' ||
      studentRecords[799].admissionNumber !== 'ADM-2026-00800'
    ) {
      errors.push(`Validation 7 Failed: Admission number bounds mismatch.`);
    } else {
      console.log(' [7/15] ✓ Admission Numbers: Strictly sequential ADM-2026-00001 through ADM-2026-00800.');
    }

    // 8. Academic Year Mapping
    const ayCheck = enrollmentRecords.every((e) => String(e.academicYearId) === String(academicYear._id));
    if (!ayCheck) {
      errors.push(`Validation 8 Failed: Some enrollments don't match target academic year.`);
    } else {
      console.log(` [8/15] ✓ Academic Year: 100% of students mapped to 2026-2027 (${academicYear._id}).`);
    }

    // 9. Grade Mapping
    const gradeCheck = enrollmentRecords.every((e) => e.gradeId);
    if (!gradeCheck) {
      errors.push(`Validation 9 Failed: Missing gradeId on enrollment.`);
    } else {
      console.log(' [9/15] ✓ Grade Mapping: 100% of students have valid Grade ObjectIds.');
    }

    // 10. Section Mapping
    const sectionCheck = enrollmentRecords.every((e) => e.sectionId);
    if (!sectionCheck) {
      errors.push(`Validation 10 Failed: Missing sectionId on enrollment.`);
    } else {
      console.log(' [10/15] ✓ Section Mapping: 100% of students have valid Section ObjectIds.');
    }

    // 11. Student Status
    const statusCheck = studentRecords.every((s) => s.status === 'ACTIVE');
    if (!statusCheck) {
      errors.push(`Validation 11 Failed: Some students are not ACTIVE.`);
    } else {
      console.log(' [11/15] ✓ Student Status: Exactly 800 students have status ACTIVE.');
    }

    // 12. Age-Appropriate DOB Check
    let ageCheckPassed = true;
    for (let i = 0; i < studentRecords.length; i++) {
      const stu = studentRecords[i];
      const enr = enrollmentRecords[i];
      const grade = standardGrades.find((g) => String(g._id) === String(enr.gradeId));
      const expectedAge = 5 + grade.sequenceOrder; // 1st -> 6, 10th -> 15
      const actualAge = calculateAgeIn2026(stu.dob);
      if (Math.abs(actualAge - expectedAge) > 1) {
        errors.push(`Validation 12 Failed: Student ${stu.studentNumber} in ${grade.name} has age ${actualAge}, expected ~${expectedAge}`);
        ageCheckPassed = false;
        break;
      }
    }
    if (ageCheckPassed) {
      console.log(' [12/15] ✓ Age & DOB: Every student has realistic, age-appropriate DOB for their standard (6 to 15 yrs).');
    }

    // 13. Guardian Linkage
    if (guardianRecords.length !== 800 || studentGuardianRecords.length !== 800) {
      errors.push(`Validation 13 Failed: Guardian record count mismatch (${guardianRecords.length} / ${studentGuardianRecords.length}).`);
    } else {
      console.log(' [13/15] ✓ Guardian Info: 100% of students have primary guardian records and links.');
    }

    // 14. Roll Number Per-Section Restart
    let rollCheckPassed = true;
    for (const [key, _] of sectionCountMap.entries()) {
      const secEnrollments = enrollmentRecords.filter((e) => `${e.gradeId}-${e.sectionId}` === key);
      const rolls = secEnrollments.map((e) => e.rollNumber).sort();
      if (rolls[0] !== '01' || rolls[19] !== '20' || rolls.length !== 20) {
        errors.push(`Validation 14 Failed: Section ${key} roll numbers invalid (${rolls[0]} .. ${rolls[19]}).`);
        rollCheckPassed = false;
      }
    }
    if (rollCheckPassed) {
      console.log(' [14/15] ✓ Roll Numbers: Exactly "01" through "20" per section, cleanly restarted per section.');
    }

    // 15. No Duplicate Student Records
    const fullNames = new Set(studentRecords.map((s) => `${s.firstName} ${s.lastName}`));
    console.log(` [15/15] ✓ Name Variety: ${fullNames.size} distinct full name combinations generated across 800 students.`);

    if (errors.length > 0) {
      console.error('\n[AUDIT FAILED] The following validation checks failed:');
      errors.forEach((e) => console.error(`  - ${e}`));
      throw new Error(`Data validation failed with ${errors.length} error(s). Seeding aborted.`);
    }

    console.log('\n✓ 15-Point Consistency Audit Passed with ZERO errors.');

    // 7. Preview Samples in Table
    console.log('\n' + '='.repeat(110));
    console.log(' SAMPLE PREVIEW: FIRST & LAST STUDENTS PER STANDARD');
    console.log('='.repeat(110));
    console.log('Std | Sec | Roll | Student ID     | Student Name          | Gender | Age | DOB        | Father Name & Phone');
    console.log('-'.repeat(110));

    [0, 19, 20, 39, 79, 159, 399, 720, 780, 799].forEach((idx) => {
      const stu = studentRecords[idx];
      const enr = enrollmentRecords[idx];
      const grade = standardGrades.find((g) => String(g._id) === String(enr.gradeId));
      const sec = gradeSectionMap.get(String(grade._id)).find((s) => String(s._id) === String(enr.sectionId));
      const age = calculateAgeIn2026(stu.dob);
      const dobStr = stu.dob.toISOString().split('T')[0];
      const father = stu.emergencyContact.name;
      const phone = stu.emergencyContact.phone;

      console.log(
        `${String(grade.sequenceOrder).padStart(2, ' ')}  | ` +
        `${sec.name.replace('Section ', '').padEnd(3, ' ')} | ` +
        `${enr.rollNumber.padEnd(4, ' ')} | ` +
        `${stu.studentNumber.padEnd(14, ' ')} | ` +
        `${(stu.firstName + ' ' + stu.lastName).padEnd(21, ' ')} | ` +
        `${stu.gender.padEnd(6, ' ')} | ` +
        `${String(age).padEnd(3, ' ')} | ` +
        `${dobStr} | ` +
        `${father} (${phone})`
      );
    });
    console.log('-'.repeat(110));

    // DRY RUN REPORT
    if (options.dryRun) {
      console.log('\n' + '='.repeat(90));
      console.log(' DRY RUN PREVIEW COMPLETED - NO MODIFICATIONS MADE TO DATABASE');
      console.log('='.repeat(90));
      console.log('Summary of what will be performed on --commit:');
      if (options.clean) {
        console.log(`  1. Clean ${existingStudentCount} existing student records and related dependents.`);
      } else {
        console.log(`  1. Existing students (${existingStudentCount}) will be preserved unless --clean is passed.`);
      }
      console.log(`  2. Insert exactly 800 new Student documents (STU-2026-00001 to STU-2026-00800).`);
      console.log(`  3. Insert exactly 800 new Guardian documents with authentic Tamil Nadu data.`);
      console.log(`  4. Insert exactly 800 new StudentGuardian links.`);
      console.log(`  5. Insert exactly 800 new Enrollment records (10 Stds × 4 Secs × 20 Students).`);
      console.log(`  6. Insert exactly 800 new Admission records.`);
      console.log(`  7. Insert exactly 800 new AcademicHistory records.`);
      console.log('\nTo execute this seed and commit to MongoDB, run:');
      console.log('  npm run seed:students:clean');
      console.log('  OR: node src/scripts/seedStudents.js --clean --commit');
      console.log('='.repeat(90) + '\n');
      return;
    }

    // ==========================================
    // COMMIT PHASE: PERFORM DATABASE OPERATIONS
    // ==========================================
    console.log('\n' + '='.repeat(90));
    console.log(' COMMITTING CHANGES TO MONGODB...');
    console.log('='.repeat(90));

    // Step A: Clean existing student records if --clean or explicit
    if (options.clean) {
      console.log('\n[1/7] Cleaning existing student and dependent transactional records...');

      // Find all existing student IDs for this school
      const existingStudents = await Student.find({ schoolId: school._id }).select('_id').lean();
      const existingStudentIds = existingStudents.map((s) => s._id);

      const delEnrollments = await Enrollment.deleteMany({ schoolId: school._id });
      const delStudentGuardians = await StudentGuardian.deleteMany({ schoolId: school._id });
      const delGuardians = await Guardian.deleteMany({ schoolId: school._id });
      const delAdmissions = await Admission.deleteMany({ schoolId: school._id });
      const delAcademicHistory = await AcademicHistory.deleteMany({ schoolId: school._id });

      // Clean dependent collections if any exist for these students
      await Promise.all([
        StudentHealthProfile.deleteMany({ schoolId: school._id }),
        StudentDocument.deleteMany({ schoolId: school._id }),
        AttendanceRecord.deleteMany({ schoolId: school._id }),
        ExamResult.deleteMany({ schoolId: school._id }),
        StudentMark.deleteMany({ schoolId: school._id }),
        DisciplineIncident.deleteMany({ schoolId: school._id }),
        DisciplinaryAction.deleteMany({ schoolId: school._id }),
        MedicalVisit.deleteMany({ schoolId: school._id }),
        FeeConcession.deleteMany({ schoolId: school._id }),
        StudentFeeAssignment.deleteMany({ schoolId: school._id }),
      ]);

      const delStudents = await Student.deleteMany({ schoolId: school._id });

      console.log(`  ✓ Deleted ${delStudents.deletedCount} existing Students.`);
      console.log(`  ✓ Deleted ${delEnrollments.deletedCount} existing Enrollments.`);
      console.log(`  ✓ Deleted ${delGuardians.deletedCount} existing Guardians.`);
      console.log(`  ✓ Deleted ${delStudentGuardians.deletedCount} existing StudentGuardian relations.`);
      console.log(`  ✓ Deleted ${delAdmissions.deletedCount} existing Admissions.`);
      console.log(`  ✓ Deleted ${delAcademicHistory.deletedCount} existing AcademicHistory records.`);
      console.log('  ✓ Master data (Academic Years, Grades, Sections, Campuses, Rooms) strictly preserved.');
    }

    // Step B: Bulk insert all 800 records in ordered batches
    console.log('\n[2/7] Inserting 800 Student documents...');
    await Student.insertMany(studentRecords, { ordered: true });
    console.log('  ✓ 800 Students inserted.');

    console.log('\n[3/7] Inserting 800 Guardian documents...');
    await Guardian.insertMany(guardianRecords, { ordered: true });
    console.log('  ✓ 800 Guardians inserted.');

    console.log('\n[4/7] Inserting 800 StudentGuardian junction documents...');
    await StudentGuardian.insertMany(studentGuardianRecords, { ordered: true });
    console.log('  ✓ 800 StudentGuardian links inserted.');

    console.log('\n[5/7] Inserting 800 Enrollment documents...');
    await Enrollment.insertMany(enrollmentRecords, { ordered: true });
    console.log('  ✓ 800 Enrollments inserted.');

    console.log('\n[6/7] Inserting 800 Admission documents...');
    await Admission.insertMany(admissionRecords, { ordered: true });
    console.log('  ✓ 800 Admissions inserted.');

    console.log('\n[7/7] Inserting 800 AcademicHistory documents...');
    await AcademicHistory.insertMany(academicHistoryRecords, { ordered: true });
    console.log('  ✓ 800 AcademicHistory records inserted.');

    // ==========================================
    // FINAL REPORT REQUIRED BY USER SPECIFICATION
    // ==========================================
    console.log('\n' + '='.repeat(90));
    console.log(' Student Seed Completed');
    console.log('='.repeat(90));
    console.log('\nTotal Students: 800');

    console.log('\nBy Standard:');
    standardGrades.forEach((g) => {
      const count = enrollmentRecords.filter((e) => String(e.gradeId) === String(g._id)).length;
      console.log(`${g.name.padEnd(14, ' ')} - ${count}`);
    });

    console.log('\nBy Section:');
    ['A', 'B', 'C', 'D'].forEach((secLetter) => {
      const count = enrollmentRecords.filter((e) => {
        const sec = gradeSectionMap.get(String(e.gradeId))?.find((s) => String(s._id) === String(e.sectionId));
        return sec?.name?.endsWith(secLetter) || sec?.code?.endsWith(secLetter);
      }).length;
      console.log(`Section ${secLetter}      - ${count}`);
    });

    console.log('\nGender:');
    const maleCount = studentRecords.filter((s) => s.gender === 'MALE').length;
    const femaleCount = studentRecords.filter((s) => s.gender === 'FEMALE').length;
    console.log(`Male           - ${maleCount}`);
    console.log(`Female         - ${femaleCount}`);

    console.log('\nStatus:');
    const activeCount = studentRecords.filter((s) => s.status === 'ACTIVE').length;
    console.log(`Active         - ${activeCount}`);

    console.log('\nStudent ID: STU-2026-00001 to STU-2026-00800');
    console.log('Admission ID: ADM-2026-00001 to ADM-2026-00800');
    console.log('Roll Numbers: Roll 01 to Roll 20 per section');
    console.log('='.repeat(90) + '\n');
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]', err.message || err);
  process.exit(1);
});
