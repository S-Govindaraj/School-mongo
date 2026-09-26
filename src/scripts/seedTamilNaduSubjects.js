/**
 * Script: seedTamilNaduSubjects.js
 * 
 * Cleans all existing subjects and provisions a comprehensive, authentic,
 * and flexible curriculum for Tamil Nadu Schools (aligned with Tamil Nadu
 * State Board / Samacheer Kalvi and Matriculation standards).
 * 
 * Key Features:
 *   - Flexible & Configurable: Subject definitions and Grade-to-Subject curriculum
 *     mappings are decoupled into declarative configuration matrices.
 *   - 20 Authentic Tamil Nadu Subjects:
 *       • Languages: Tamil (Part I), English (Part II), Hindi, French, Sanskrit
 *       • Core Academic: Mathematics, Science, Social Science, EVS, Computer Science/ICT
 *       • Co-Curricular & Skills: Physical Education (PET/Yoga), Moral Science & Value Ed,
 *         Visual Arts & Crafts, General Knowledge & Life Skills, Library & Reading
 *       • Pre-KG Foundational: Tamil Rhymes, English Phonics, Early Numeracy, Sensory Play, Coloring
 *   - Automatic ClassSubject Provisioning: Mappings for all 11 grades (Pre-KG + 1st–10th Standards)
 *     with appropriate weekly periods, pass marks (35), max marks (100 or 50), and practical splits.
 *   - Safe Execution: Supports `--dry-run` (default) and `--commit` flags.
 * 
 * Usage:
 *   node src/scripts/seedTamilNaduSubjects.js --dry-run
 *   node src/scripts/seedTamilNaduSubjects.js --commit
 */

require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

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
const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const ExamSubject = require('../models/ExamSubject');

/**
 * ----------------------------------------------------------------------------
 * 1. DECLARATIVE SUBJECT CATALOG (TAMIL NADU SCHOOL SPECIFICATION)
 * ----------------------------------------------------------------------------
 * Editable catalog representing the curriculum of Tamil Nadu State Board &
 * Matriculation institutions.
 */
const TAMIL_NADU_SUBJECT_CATALOG = [
  // --- PART I & II LANGUAGES ---
  {
    code: 'TAM',
    name: 'Tamil Language',
    shortName: 'Tamil',
    type: 'LANGUAGE',
    description: 'Tamil language, literature, grammar, prose, and poetry under the Tamil Nadu Samacheer Kalvi framework.',
    status: 'ACTIVE',
  },
  {
    code: 'ENG',
    name: 'English Language & Literature',
    shortName: 'English',
    type: 'LANGUAGE',
    description: 'English language comprehension, communicative skills, grammar, prose, and poetry.',
    status: 'ACTIVE',
  },
  {
    code: 'HIN',
    name: 'Hindi',
    shortName: 'Hindi',
    type: 'LANGUAGE',
    description: 'Optional third language / secondary language covering conversation, reading, and literature.',
    status: 'ACTIVE',
  },
  {
    code: 'FRE',
    name: 'French',
    shortName: 'French',
    type: 'LANGUAGE',
    description: 'Elective foreign language covering French grammar, vocabulary, reading, and spoken skills.',
    status: 'ACTIVE',
  },
  {
    code: 'SAN',
    name: 'Sanskrit',
    shortName: 'Sanskrit',
    type: 'LANGUAGE',
    description: 'Optional classical language curriculum covering foundational grammar and classical verses.',
    status: 'ACTIVE',
  },

  // --- CORE ACADEMIC & STEM SUBJECTS ---
  {
    code: 'MATH',
    name: 'Mathematics',
    shortName: 'Maths',
    type: 'CORE',
    description: 'Arithmetic, Algebra, Geometry, Mensuration, Trigonometry, and Statistics.',
    status: 'ACTIVE',
  },
  {
    code: 'SCI',
    name: 'Science',
    shortName: 'Science',
    type: 'CORE',
    description: 'Integrated Science covering Physics, Chemistry, and Biology with laboratory experiments.',
    status: 'ACTIVE',
  },
  {
    code: 'SOC-SCI',
    name: 'Social Science',
    shortName: 'Social',
    type: 'CORE',
    description: 'History, Geography, Civics, and Economics under the Tamil Nadu State Board curriculum.',
    status: 'ACTIVE',
  },
  {
    code: 'EVS',
    name: 'Environmental Studies',
    shortName: 'EVS',
    type: 'CORE',
    description: 'Foundational environmental awareness, nature study, ecology, and hygiene for primary standards.',
    status: 'ACTIVE',
  },
  {
    code: 'CS',
    name: 'Computer Science & ICT',
    shortName: 'Computer',
    type: 'CORE',
    description: 'Fundamentals of computing, office tools, algorithmic thinking, and digital literacy.',
    status: 'ACTIVE',
  },

  // --- CO-CURRICULAR, ACTIVITY & VALUE SUBJECTS ---
  {
    code: 'PET',
    name: 'Physical & Health Education',
    shortName: 'PET',
    type: 'ACTIVITY',
    description: 'Physical fitness, track and field athletics, team sports, yogasana, and health hygiene.',
    status: 'ACTIVE',
  },
  {
    code: 'VE',
    name: 'Moral Science & Value Education',
    shortName: 'Moral Sci',
    type: 'ACTIVITY',
    description: 'Ethics, character building, cultural heritage, civic consciousness, and life skills.',
    status: 'ACTIVE',
  },
  {
    code: 'ART',
    name: 'Visual Arts, Drawing & Crafts',
    shortName: 'Art/Craft',
    type: 'ACTIVITY',
    description: 'Drawing, sketching, painting, paper crafts, clay modeling, and cultural art.',
    status: 'ACTIVE',
  },
  {
    code: 'GK',
    name: 'General Knowledge & Current Affairs',
    shortName: 'GK',
    type: 'ACTIVITY',
    description: 'National and global awareness, scientific facts, history trivia, and quiz programs.',
    status: 'ACTIVE',
  },
  {
    code: 'LIB',
    name: 'Library & Reading Literacy',
    shortName: 'Library',
    type: 'ACTIVITY',
    description: 'Guided library reading, book reviews, literary appreciation, and research skills.',
    status: 'ACTIVE',
  },

  // --- PRE-KG FOUNDATIONAL DEVELOPMENT DOMAINS ---
  {
    code: 'PKG-TAM',
    name: 'Early Tamil Rhymes & Storytelling',
    shortName: 'Tamil Rhymes',
    type: 'ACTIVITY',
    description: 'Tamil nursery rhymes, conversational listening, audio-visual storytelling, and speech development.',
    status: 'ACTIVE',
  },
  {
    code: 'PKG-ENG',
    name: 'English Phonics & Rhymes',
    shortName: 'Phonics',
    type: 'ACTIVITY',
    description: 'Phonics sounds, English nursery rhymes, picture reading, and foundational vocabulary.',
    status: 'ACTIVE',
  },
  {
    code: 'PKG-NUM',
    name: 'Early Numeracy, Shapes & Logic',
    shortName: 'Numeracy',
    type: 'ACTIVITY',
    description: 'Shape identification, counting basics, color recognition, and cognitive puzzles.',
    status: 'ACTIVE',
  },
  {
    code: 'PKG-PLAY',
    name: 'Sensory Play, Motor Skills & Games',
    shortName: 'Play & Motor',
    type: 'ACTIVITY',
    description: 'Fine and gross motor development, indoor sensory play, rhythmic action songs, and outdoor games.',
    status: 'ACTIVE',
  },
  {
    code: 'PKG-ART',
    name: 'Creative Coloring, Crafts & Drawing',
    shortName: 'Coloring',
    type: 'ACTIVITY',
    description: 'Crayon coloring, finger printing, paper tearing, and tactile play.',
    status: 'ACTIVE',
  },
];

/**
 * ----------------------------------------------------------------------------
 * 2. GRADE-TO-SUBJECT CURRICULUM CONFIGURATION
 * ----------------------------------------------------------------------------
 * Maps which subjects apply to which grade stages. Easily modifiable.
 */
const GRADE_STAGE_CONFIG = {
  // Pre-KG (Sequence 0): 5 early childhood developmental areas
  PRE_KG: [
    { code: 'PKG-TAM', weeklyPeriods: 6, maxMarks: 50, passMarks: 20, isMandatory: true },
    { code: 'PKG-ENG', weeklyPeriods: 6, maxMarks: 50, passMarks: 20, isMandatory: true },
    { code: 'PKG-NUM', weeklyPeriods: 6, maxMarks: 50, passMarks: 20, isMandatory: true },
    { code: 'PKG-PLAY', weeklyPeriods: 6, maxMarks: 50, passMarks: 20, isMandatory: true },
    { code: 'PKG-ART', weeklyPeriods: 6, maxMarks: 50, passMarks: 20, isMandatory: true },
  ],

  // Lower Primary: 1st & 2nd Standards (Sequence 1 & 2)
  PRIMARY_LOWER: [
    { code: 'TAM', weeklyPeriods: 7, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'ENG', weeklyPeriods: 7, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'MATH', weeklyPeriods: 7, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'EVS', weeklyPeriods: 6, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'CS', weeklyPeriods: 3, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'PET', weeklyPeriods: 3, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'VE', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'ART', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'GK', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: true },
  ],

  // Upper Primary: 3rd, 4th & 5th Standards (Sequence 3, 4, 5)
  PRIMARY_UPPER: [
    { code: 'TAM', weeklyPeriods: 6, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'ENG', weeklyPeriods: 6, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'MATH', weeklyPeriods: 6, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'SCI', weeklyPeriods: 5, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'SOC-SCI', weeklyPeriods: 5, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'CS', weeklyPeriods: 3, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'PET', weeklyPeriods: 3, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'VE', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'ART', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'HIN', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: false, isElective: true, subjectGroup: 'Optional Language' },
  ],

  // Middle School: 6th, 7th & 8th Standards (Sequence 6, 7, 8)
  MIDDLE: [
    { code: 'TAM', weeklyPeriods: 6, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'ENG', weeklyPeriods: 6, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'MATH', weeklyPeriods: 6, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'SCI', weeklyPeriods: 6, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'SOC-SCI', weeklyPeriods: 5, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'CS', weeklyPeriods: 3, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'PET', weeklyPeriods: 3, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'VE', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'ART', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'HIN', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: false, isElective: true, subjectGroup: 'Optional Language' },
  ],

  // Secondary School: 9th & 10th Standards (Sequence 9 & 10 - Tamil Nadu SSLC)
  SECONDARY: [
    { code: 'TAM', weeklyPeriods: 7, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'ENG', weeklyPeriods: 7, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'MATH', weeklyPeriods: 8, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'SCI', weeklyPeriods: 8, maxMarks: 100, passMarks: 35, theoryMarks: 75, practicalMarks: 25, isMandatory: true },
    { code: 'SOC-SCI', weeklyPeriods: 7, maxMarks: 100, passMarks: 35, isMandatory: true },
    { code: 'CS', weeklyPeriods: 3, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'PET', weeklyPeriods: 2, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'VE', weeklyPeriods: 1, maxMarks: 50, passMarks: 18, isMandatory: true },
    { code: 'FRE', weeklyPeriods: 3, maxMarks: 100, passMarks: 35, isMandatory: false, isElective: true, subjectGroup: 'Elective Language' },
  ],
};

function getCurriculumForGrade(grade) {
  const seq = grade.sequenceOrder;
  if (seq === 0) return GRADE_STAGE_CONFIG.PRE_KG;
  if (seq >= 1 && seq <= 2) return GRADE_STAGE_CONFIG.PRIMARY_LOWER;
  if (seq >= 3 && seq <= 5) return GRADE_STAGE_CONFIG.PRIMARY_UPPER;
  if (seq >= 6 && seq <= 8) return GRADE_STAGE_CONFIG.MIDDLE;
  if (seq >= 9 && seq <= 10) return GRADE_STAGE_CONFIG.SECONDARY;
  return GRADE_STAGE_CONFIG.MIDDLE;
}

async function main() {
  const args = process.argv.slice(2);
  const isCommit = args.includes('--commit');
  const isDryRun = !isCommit || args.includes('--dry-run');

  console.log('='.repeat(78));
  console.log('  TAMIL NADU SCHOOL ERP - SUBJECT & CURRICULUM SEEDING PIPELINE');
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
    console.error('✗ Error: No academic year found for school.');
    process.exit(1);
  }
  const academicYearId = academicYear._id;
  console.log(`✓ Active Academic Year: "${academicYear.name}" (ID: ${academicYearId})`);

  // 3. Resolve Grades
  const grades = await Grade.find({ schoolId, status: 'ACTIVE' }).sort({ sequenceOrder: 1 }).lean();
  console.log(`✓ Found ${grades.length} Grades (Pre-KG through 10th Standard).\n`);

  // 4. Audit Existing Subjects & ClassSubjects
  const existingSubjects = await Subject.find({ schoolId }).lean();
  const existingClassSubjects = await ClassSubject.find({ schoolId }).lean();
  console.log(`[Audit] Current DB State:`);
  console.log(`  - Existing Subjects: ${existingSubjects.length}`);
  console.log(`  - Existing ClassSubject Mappings: ${existingClassSubjects.length}`);
  console.log(`  - New Subjects to Seed: ${TAMIL_NADU_SUBJECT_CATALOG.length}\n`);

  if (isDryRun) {
    console.log('--- [DRY RUN] Subject Catalog to be Seeded ---');
    TAMIL_NADU_SUBJECT_CATALOG.forEach((s, idx) => {
      console.log(`  ${String(idx + 1).padStart(2, ' ')}. [${s.code.padEnd(8, ' ')}] ${s.name.padEnd(45, ' ')} (${s.type})`);
    });

    console.log('\n--- [DRY RUN] Grade Curriculum Mapping Preview ---');
    let totalProjectedClassSubjects = 0;
    for (const g of grades) {
      const curriculum = getCurriculumForGrade(g);
      totalProjectedClassSubjects += curriculum.length;
      const codes = curriculum.map((c) => c.code).join(', ');
      console.log(`  - Grade ${g.sequenceOrder} [${g.code}]: ${g.name} -> ${curriculum.length} Subjects (${codes})`);
    }

    console.log(`\nTotal Projected ClassSubject Links: ${totalProjectedClassSubjects}`);
    console.log('\n==============================================================================');
    console.log('DRY RUN COMPLETE — Zero data was modified.');
    console.log('To apply these changes to MongoDB Atlas, run:');
    console.log('  node src/scripts/seedTamilNaduSubjects.js --commit');
    console.log('==============================================================================\n');
    await mongoose.disconnect();
    return;
  }

  // --- COMMIT MODE ---
  console.log('Applying database updates...\n');

  // Step A: Clean existing subjects and old class subjects
  console.log('Step 1: Purging old Subject and ClassSubject records...');
  const deletedCS = await ClassSubject.deleteMany({ schoolId });
  const deletedSubs = await Subject.deleteMany({ schoolId });
  console.log(`  ✓ Removed ${deletedSubs.deletedCount} old Subject records.`);
  console.log(`  ✓ Removed ${deletedCS.deletedCount} old ClassSubject records.`);

  // Step B: Insert the 20 new Tamil Nadu Subjects
  console.log('\nStep 2: Inserting 20 authentic Tamil Nadu subjects...');
  const subjectDocsToInsert = TAMIL_NADU_SUBJECT_CATALOG.map((s) => ({
    ...s,
    schoolId,
    normalizedName: s.name.trim().toLowerCase(),
    code: s.code.trim().toUpperCase(),
  }));

  const createdSubjects = await Subject.insertMany(subjectDocsToInsert);
  console.log(`  ✓ Successfully created ${createdSubjects.length} subjects in catalog:`);
  createdSubjects.forEach((s) => {
    console.log(`    • [${s.code}] ${s.name} (${s.type})`);
  });

  // Build Code -> Subject Map for quick lookup
  const subjectCodeMap = new Map();
  createdSubjects.forEach((s) => subjectCodeMap.set(s.code, s));

  // Step C: Provision ClassSubject mappings across all 11 grades
  console.log('\nStep 3: Creating ClassSubject curriculum mappings for all 11 grades...');
  const classSubjectDocs = [];

  for (const grade of grades) {
    const curriculum = getCurriculumForGrade(grade);
    for (const item of curriculum) {
      const subject = subjectCodeMap.get(item.code);
      if (!subject) {
        console.warn(`  [warn] Subject with code "${item.code}" not found for grade ${grade.name}`);
        continue;
      }

      classSubjectDocs.push({
        schoolId,
        academicYearId,
        gradeId: grade._id,
        subjectId: subject._id,
        isMandatory: item.isMandatory !== undefined ? item.isMandatory : true,
        isElective: item.isElective || false,
        subjectGroup: item.subjectGroup || '',
        weeklyPeriods: item.weeklyPeriods || 5,
        passMarks: item.passMarks || 35,
        maxMarks: item.maxMarks || 100,
        theoryMarks: item.theoryMarks,
        practicalMarks: item.practicalMarks,
        status: 'ACTIVE',
      });
    }
  }

  const createdClassSubjects = await ClassSubject.insertMany(classSubjectDocs);
  console.log(`  ✓ Successfully linked ${createdClassSubjects.length} ClassSubject records across 11 grades.`);

  // Step D: Verify Grade Breakdown
  console.log('\nStep 4: Curriculum Breakdown Summary:');
  for (const g of grades) {
    const count = await ClassSubject.countDocuments({ schoolId, gradeId: g._id });
    console.log(`  - ${g.name} (${g.code}): ${count} active subjects mapped`);
  }

  console.log('\n==============================================================================');
  console.log('✓ TAMIL NADU SUBJECT SEEDING PIPELINE COMPLETED SUCCESSFULLY!');
  console.log('==============================================================================\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n✗ Fatal Error:', err);
  process.exit(1);
});
