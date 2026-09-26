/**
 * Script: seedGradesAndSections.js
 * Seeds Grades (1st Standard to 10th Standard) and Sections (Section A, B, C, D)
 * with unique classroom room mapping per section.
 *
 * Requirements:
 *   - Grades: 1st Standard to 10th Standard
 *     Name: "First Standard", Code: "1st", sequenceOrder: 1
 *     Name: "Second Standard", Code: "2nd", sequenceOrder: 2
 *     ... till 10th Standard
 *   - Sections: Section A, Section B (and C, D for 4 sections)
 *     Name: "Section A", Code: "S - A"
 *     Name: "Section B", Code: "S - B"
 *     Name: "Section C", Code: "S - C"
 *     Name: "Section D", Code: "S - D"
 *   - Rooms: Maps each section to a UNIQUE regular classroom (isLab: false, status: ACTIVE)
 *   - Clean: Optionally cleans existing grades and sections before seeding (--clean)
 *   - Dry Run: Supports dry-run preview (--dry-run) without writing to MongoDB
 *
 * Usage:
 *   node src/scripts/seedGradesAndSections.js --dry-run           # Dry run preview (Default)
 *   node src/scripts/seedGradesAndSections.js --commit            # Apply changes to DB
 *   node src/scripts/seedGradesAndSections.js --clean --commit    # Clean existing & seed new
 *   node src/scripts/seedGradesAndSections.js --clean --dry-run   # Preview clean + seed in dry run
 *   node src/scripts/seedGradesAndSections.js --sections=2        # Only Section A & B (2 sections)
 *   node src/scripts/seedGradesAndSections.js --sections=4        # Section A, B, C, D (4 sections, default)
 *   node src/scripts/seedGradesAndSections.js --campus=MAIN       # Prioritize rooms from MAIN campus
 */

require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

// DNS server fallback for robust MongoDB Atlas connection
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
const Campus = require('../models/Campus');
const Room = require('../models/Room');
const Grade = require('../models/Grade');
const Section = require('../models/Section');

// Grade definitions: 1st Standard to 10th Standard
const GRADE_DEFINITIONS = [
  { name: 'First Standard', code: '1st Std', sequenceOrder: 1, category: 'Primary' },
  { name: 'Second Standard', code: '2nd Std', sequenceOrder: 2, category: 'Primary' },
  { name: 'Third Standard', code: '3rd Std', sequenceOrder: 3, category: 'Primary' },
  { name: 'Fourth Standard', code: '4th Std', sequenceOrder: 4, category: 'Primary' },
  { name: 'Fifth Standard', code: '5th Std', sequenceOrder: 5, category: 'Primary' },
  { name: 'Sixth Standard', code: '6th Std', sequenceOrder: 6, category: 'Middle' },
  { name: 'Seventh Standard', code: '7th Std', sequenceOrder: 7, category: 'Middle' },
  { name: 'Eighth Standard', code: '8th Std', sequenceOrder: 8, category: 'Middle' },
  { name: 'Ninth Standard', code: '9th Std', sequenceOrder: 9, category: 'Secondary' },
  { name: 'Tenth Standard', code: '10th Std', sequenceOrder: 10, category: 'Secondary' },
];

// Section definitions: Section A to Section D (or customizable)
const SECTION_TEMPLATES = [
  { name: 'Section A', code: 'S - A' },
  { name: 'Section B', code: 'S - B' },
  { name: 'Section C', code: 'S - C' },
  { name: 'Section D', code: 'S - D' },
];

// CLI Argument Parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: true, // Default to dry-run for safety unless --commit is passed
    clean: false,
    schoolId: null,
    campusTarget: null,
    sectionsCount: 4, // Default: 4 sections per grade (A, B, C, D)
    capacity: 40,
  };

  for (const arg of args) {
    if (arg === '--commit') options.dryRun = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--clean') options.clean = true;
    else if (arg.startsWith('--school=')) options.schoolId = arg.split('=')[1].trim();
    else if (arg.startsWith('--campus=')) options.campusTarget = arg.split('=')[1].trim();
    else if (arg.startsWith('--sections=')) {
      const val = arg.split('=')[1].trim().toLowerCase();
      if (val === '2' || val === 'ab' || val === 'a-b') options.sectionsCount = 2;
      else if (val === '4' || val === 'abcd' || val === 'a-d') options.sectionsCount = 4;
      else options.sectionsCount = parseInt(val, 10) || 4;
    } else if (arg.startsWith('--capacity=')) {
      options.capacity = parseInt(arg.split('=')[1], 10) || 40;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(80));
  console.log(' School ERP - Grades & Sections Seeder with Unique Room Allocation');
  console.log('='.repeat(80));
  console.log('Configuration:');
  console.log(`  Mode:               ${options.dryRun ? 'DRY RUN (Preview Only - Zero DB Changes)' : 'COMMIT (Applying changes to MongoDB)'}`);
  console.log(`  Clean Existing:     ${options.clean ? 'YES (Will remove existing sections & grades)' : 'NO'}`);
  console.log(`  Grades To Create:   10 (1st Standard to 10th Standard)`);
  console.log(`  Sections Per Grade: ${options.sectionsCount} (Section A .. ${String.fromCharCode(65 + options.sectionsCount - 1)})`);
  console.log(`  Total Sections:     ${10 * options.sectionsCount} sections`);
  console.log(`  Section Capacity:   ${options.capacity}`);
  console.log(`  Campus Filter:      ${options.campusTarget || 'All active regular classrooms'}`);
  console.log('='.repeat(80));

  await connectToDatabase();

  try {
    // 1. Resolve Target School
    let school;
    if (options.schoolId) {
      school = await School.findById(options.schoolId);
      if (!school) throw new Error(`Target school with ID "${options.schoolId}" not found.`);
    } else {
      school = await School.findOne({});
      if (!school) throw new Error('No school found in database. Please seed or create a school profile first.');
    }
    console.log(`\nTarget School: "${school.name}" (${school.code || 'ID: ' + school._id})`);

    // 2. Resolve Available Campuses
    const campuses = await Campus.find({ schoolId: school._id, status: { $ne: 'ARCHIVED' } });
    console.log(`Campuses Available: ${campuses.length} (${campuses.map((c) => c.code || c.name).join(', ')})`);

    let targetCampusId = null;
    if (options.campusTarget) {
      const matched = campuses.find(
        (c) => c.code?.toLowerCase() === options.campusTarget.toLowerCase() ||
               c.name?.toLowerCase().includes(options.campusTarget.toLowerCase()) ||
               String(c._id) === options.campusTarget
      );
      if (matched) {
        targetCampusId = matched._id;
        console.log(`Targeting Campus: ${matched.name} (${matched.code})`);
      } else {
        console.log(`[warn] Campus filter "${options.campusTarget}" did not match. Using all classrooms.`);
      }
    }

    // 3. Inspect Existing Data
    const existingGrades = await Grade.find({ schoolId: school._id }).sort({ sequenceOrder: 1 });
    const existingSections = await Section.find({ schoolId: school._id });
    console.log(`\nCurrent Database State:`);
    console.log(`  Existing Grades:   ${existingGrades.length}`);
    console.log(`  Existing Sections: ${existingSections.length}`);

    if (existingGrades.length > 0) {
      console.log(`  Existing Grade list: ${existingGrades.map((g) => `${g.name} (${g.code})`).join(', ')}`);
    }

    // 4. Fetch Available Regular Classrooms for Unique Room Mapping
    const roomFilter = {
      schoolId: school._id,
      isLab: false,
      status: 'ACTIVE',
    };
    if (targetCampusId) {
      roomFilter.campusId = targetCampusId;
    }

    let availableRooms = await Room.find(roomFilter).sort({ name: 1 });
    if (availableRooms.length < 10 * options.sectionsCount && targetCampusId) {
      console.log(`[warn] Not enough rooms in campus ${options.campusTarget}. Falling back to all school classrooms.`);
      delete roomFilter.campusId;
      availableRooms = await Room.find(roomFilter).sort({ name: 1 });
    }

    console.log(`\nAvailable Classrooms: ${availableRooms.length} regular classrooms found.`);
    const requiredRooms = 10 * options.sectionsCount;
    if (availableRooms.length < requiredRooms) {
      throw new Error(`Insufficient regular classrooms! Required: ${requiredRooms}, Available: ${availableRooms.length}. Please add more rooms or reduce sections.`);
    }

    // 5. Build Seed Plan
    const activeSections = SECTION_TEMPLATES.slice(0, options.sectionsCount);
    const plan = [];
    let roomIndex = 0;

    for (const gDef of GRADE_DEFINITIONS) {
      const gradeSections = [];
      for (const sDef of activeSections) {
        const assignedRoom = availableRooms[roomIndex++];
        gradeSections.push({
          sectionName: sDef.name,
          sectionCode: sDef.code,
          capacity: options.capacity,
          room: assignedRoom.name,
          roomId: assignedRoom._id,
          status: 'ACTIVE',
        });
      }
      plan.push({
        grade: {
          name: gDef.name,
          code: gDef.code,
          sequenceOrder: gDef.sequenceOrder,
          category: gDef.category,
          status: 'ACTIVE',
        },
        sections: gradeSections,
      });
    }

    // 6. Print Detailed Seed Plan Table
    console.log('\n' + '='.repeat(100));
    console.log(options.dryRun ? ' [DRY RUN PREVIEW] PLANNED GRADES & SECTIONS' : ' [COMMIT] EXECUTING GRADES & SECTIONS SEEDING');
    console.log('='.repeat(100));
    console.log(
      'Seq | Grade Name       | Grade Code | Category  | Section Name | Code  | Assigned Room | Room ID (ref)'
    );
    console.log('-'.repeat(100));

    plan.forEach(({ grade, sections }) => {
      sections.forEach((sec, idx) => {
        const seqStr = idx === 0 ? String(grade.sequenceOrder).padStart(2, ' ') : '  ';
        const gradeNameStr = idx === 0 ? grade.name.padEnd(16, ' ') : ''.padEnd(16, ' ');
        const gradeCodeStr = idx === 0 ? grade.code.padEnd(10, ' ') : ''.padEnd(10, ' ');
        const catStr = idx === 0 ? grade.category.padEnd(9, ' ') : ''.padEnd(9, ' ');
        const secNameStr = sec.sectionName.padEnd(12, ' ');
        const secCodeStr = sec.sectionCode.padEnd(5, ' ');
        const roomStr = sec.room.padEnd(13, ' ');
        const roomIdStr = String(sec.roomId);

        console.log(`${seqStr}  | ${gradeNameStr} | ${gradeCodeStr} | ${catStr} | ${secNameStr} | ${secCodeStr} | ${roomStr} | ${roomIdStr}`);
      });
      console.log('-'.repeat(100));
    });

    // 7. Verify Unique Room Constraint
    const usedRoomIds = new Set();
    const usedRoomNames = new Set();
    let collisionDetected = false;

    plan.forEach(({ sections }) => {
      sections.forEach((s) => {
        const idStr = String(s.roomId);
        if (usedRoomIds.has(idStr)) {
          console.error(`[ERROR] Duplicate room ID detected: ${idStr} (${s.room})`);
          collisionDetected = true;
        }
        if (usedRoomNames.has(s.room)) {
          console.error(`[ERROR] Duplicate room name detected: ${s.room}`);
          collisionDetected = true;
        }
        usedRoomIds.add(idStr);
        usedRoomNames.add(s.room);
      });
    });

    if (collisionDetected) {
      throw new Error('Room allocation collision detected! Each section must map to a unique room.');
    }
    console.log(`\n✓ Room Uniqueness Check Passed: Exactly ${usedRoomIds.size} unique classrooms assigned to ${usedRoomIds.size} sections.`);

    // 8. Execute or Dry-Run Report
    if (options.dryRun) {
      console.log('\n' + '='.repeat(80));
      console.log(' DRY RUN COMPLETED - NO CHANGES APPLIED TO DATABASE');
      console.log('='.repeat(80));
      console.log(`  Grades to create:        10`);
      console.log(`  Sections to create:      ${10 * options.sectionsCount}`);
      console.log(`  Unique Rooms allocated:  ${usedRoomIds.size}`);
      console.log(`  Clean flag set:          ${options.clean ? 'YES' : 'NO'}`);
      console.log('\nTo execute and write this to MongoDB, run:');
      console.log(`  node src/scripts/seedGradesAndSections.js ${options.clean ? '--clean ' : ''}--commit`);
      console.log('='.repeat(80) + '\n');
      return;
    }

    // COMMIT PHASE
    console.log('\n' + '='.repeat(80));
    console.log(' COMMITTING CHANGES TO MONGODB...');
    console.log('='.repeat(80));

    // A. Clean existing if requested
    if (options.clean) {
      console.log('\nCleaning existing sections and grades for this school...');
      const deletedSections = await Section.deleteMany({ schoolId: school._id });
      const deletedGrades = await Grade.deleteMany({ schoolId: school._id });
      console.log(`  Deleted ${deletedSections.deletedCount} existing sections.`);
      console.log(`  Deleted ${deletedGrades.deletedCount} existing grades.`);
    }

    // B. Create Grades and Sections
    let createdGradesCount = 0;
    let createdSectionsCount = 0;

    for (const item of plan) {
      // Find or create Grade
      let gradeDoc = await Grade.findOne({ schoolId: school._id, code: item.grade.code.toUpperCase() });
      if (!gradeDoc) {
        gradeDoc = await Grade.create({
          schoolId: school._id,
          name: item.grade.name,
          code: item.grade.code,
          category: item.grade.category,
          sequenceOrder: item.grade.sequenceOrder,
          status: 'ACTIVE',
        });
        createdGradesCount++;
      } else {
        gradeDoc.name = item.grade.name;
        gradeDoc.sequenceOrder = item.grade.sequenceOrder;
        gradeDoc.category = item.grade.category;
        gradeDoc.status = 'ACTIVE';
        await gradeDoc.save();
      }

      // Create Sections for this Grade
      for (const sec of item.sections) {
        let secDoc = await Section.findOne({ schoolId: school._id, gradeId: gradeDoc._id, name: sec.sectionName });
        if (!secDoc) {
          secDoc = await Section.create({
            schoolId: school._id,
            gradeId: gradeDoc._id,
            name: sec.sectionName,
            code: sec.sectionCode,
            capacity: sec.capacity,
            room: sec.room,
            roomId: sec.roomId,
            status: 'ACTIVE',
          });
          createdSectionsCount++;
        } else {
          secDoc.code = sec.sectionCode;
          secDoc.capacity = sec.capacity;
          secDoc.room = sec.room;
          secDoc.roomId = sec.roomId;
          secDoc.status = 'ACTIVE';
          await secDoc.save();
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(' SUCCESS: GRADES & SECTIONS SEEDED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log(`  Grades Processed:       ${plan.length} (New: ${createdGradesCount})`);
    console.log(`  Sections Processed:     ${plan.length * options.sectionsCount} (New: ${createdSectionsCount})`);
    console.log(`  Unique Rooms Assigned:  ${usedRoomIds.size}`);
    console.log('='.repeat(80) + '\n');
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]', err.message || err);
  process.exit(1);
});
