/**
 * Script: seedRooms.js
 * Creates 100 rooms per campus (starting at room number 100), including 10 lab rooms.
 *
 * DB Connection: Mirrors seedStudent360DemoData.js with robust DNS fallback and retry logic.
 *
 * Per Campus Structure:
 *   - Total rooms: 100 per campus (by default: numbers 100 to 199)
 *   - Classrooms: 90 regular classrooms (100 to 189, isLab: false, capacity: 30)
 *   - Lab Rooms:  10 specialized lab rooms (190 to 199, isLab: true, capacity: 30)
 *
 * Naming & Multi-Campus Uniqueness:
 *   MongoDB enforces a unique index on { schoolId: 1, name: 1 }.
 *   When multiple campuses exist in a school, names are prefixed with the campus code
 *   (e.g., MAIN-100 .. MAIN-189, MAIN-Lab 190 .. MAIN-Lab 199) to ensure zero collisions.
 *   If only a single campus exists or via --naming=plain, plain numbers/names are used.
 *
 * Usage:
 *   node src/scripts/seedRooms.js                         # Run for all campuses
 *   node src/scripts/seedRooms.js --dry-run               # Preview only without writing to DB
 *   node src/scripts/seedRooms.js --campus=MAIN           # Target single campus by code or ID
 *   node src/scripts/seedRooms.js --school=<id>           # Target specific school
 *   node src/scripts/seedRooms.js --start=100             # Starting room number (default: 100)
 *   node src/scripts/seedRooms.js --count=100             # Total rooms per campus (default: 100)
 *   node src/scripts/seedRooms.js --labs=10               # Number of lab rooms (default: 10)
 *   node src/scripts/seedRooms.js --capacity=30           # Default room capacity (default: 30)
 *   node src/scripts/seedRooms.js --naming=prefix         # 'prefix' (MAIN-100), 'bracket' (Room 100 (MAIN)), or 'plain' (100)
 *   node src/scripts/seedRooms.js --clean                 # Remove previous generated rooms before seeding
 */
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

// Configure DNS servers matching seedStudent360DemoData.js
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

// Models
const School = require('../models/School');
const Campus = require('../models/Campus');
const Room = require('../models/Room');

// CLI Argument Parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    clean: false,
    schoolId: null,
    campusTarget: null,
    start: 100,
    count: 100,
    labs: 10,
    capacity: 30,
    naming: null, // 'prefix', 'bracket', 'plain'
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--clean') options.clean = true;
    else if (arg.startsWith('--school=')) options.schoolId = arg.split('=')[1].trim();
    else if (arg.startsWith('--campus=')) options.campusTarget = arg.split('=')[1].trim();
    else if (arg.startsWith('--start=')) options.start = parseInt(arg.split('=')[1], 10) || 100;
    else if (arg.startsWith('--count=')) options.count = parseInt(arg.split('=')[1], 10) || 100;
    else if (arg.startsWith('--labs=')) options.labs = parseInt(arg.split('=')[1], 10) || 10;
    else if (arg.startsWith('--capacity=')) options.capacity = parseInt(arg.split('=')[1], 10) || 30;
    else if (arg.startsWith('--naming=')) options.naming = arg.split('=')[1].trim().toLowerCase();
  }

  return options;
}

const LAB_DISCIPLINES = [
  'Physics',
  'Chemistry',
  'Biology',
  'Computer',
  'Robotics',
  'Language',
  'Mathematics',
  'Science',
  'STEM',
  'Multimedia',
];

function buildRoomName(campus, roomNum, isLab, labIndex, namingStyle, hasMultipleCampuses) {
  const code = campus.code || campus.name.slice(0, 4).toUpperCase();
  const labSubject = isLab && labIndex >= 0 ? LAB_DISCIPLINES[labIndex % LAB_DISCIPLINES.length] : '';

  if (namingStyle === 'plain' || (!hasMultipleCampuses && !namingStyle)) {
    if (isLab) {
      return `Lab ${roomNum} (${labSubject})`;
    }
    return `Room ${roomNum}`;
  }

  if (namingStyle === 'bracket') {
    if (isLab) {
      return `Lab ${roomNum} (${labSubject}) - ${code}`;
    }
    return `Room ${roomNum} (${code})`;
  }

  // Default: 'prefix' (e.g. MAIN-100, MAIN-Lab 190 (Physics))
  if (isLab) {
    return `${code}-Lab ${roomNum} (${labSubject})`;
  }
  return `${code}-${roomNum}`;
}

async function main() {
  const options = parseArgs();
  console.log('='.repeat(70));
  console.log('School ERP - Room Seeder Script');
  console.log('='.repeat(70));
  console.log(`Configuration:`);
  console.log(`  Dry Run:            ${options.dryRun ? 'YES (No DB changes)' : 'NO (Applying changes)'}`);
  console.log(`  Clean Existing:     ${options.clean ? 'YES' : 'NO'}`);
  console.log(`  Rooms Per Campus:   ${options.count} total`);
  console.log(`  Lab Rooms:          ${options.labs} lab rooms`);
  console.log(`  Classrooms:         ${options.count - options.labs} classrooms`);
  console.log(`  Starting Number:    ${options.start} (range: ${options.start} to ${options.start + options.count - 1})`);
  console.log(`  Default Capacity:   ${options.capacity}`);
  console.log('='.repeat(70));

  await connectToDatabase();

  try {
    // 1. Resolve Target School
    let school;
    if (options.schoolId) {
      school = await School.findById(options.schoolId);
      if (!school) {
        throw new Error(`School with ID '${options.schoolId}' not found.`);
      }
    } else {
      school = await School.findOne({ status: 'ACTIVE' }) || await School.findOne({});
      if (!school) {
        throw new Error('No schools found in database.');
      }
    }
    console.log(`Target School: ${school.name} (ID: ${school._id})`);

    // 2. Resolve Campuses
    const campusFilter = { schoolId: school._id, status: { $ne: 'ARCHIVED' } };
    if (options.campusTarget) {
      campusFilter.$or = [
        { code: options.campusTarget.toUpperCase() },
        { name: new RegExp(options.campusTarget, 'i') },
      ];
      if (mongoose.Types.ObjectId.isValid(options.campusTarget)) {
        campusFilter.$or.push({ _id: options.campusTarget });
      }
    }

    const campuses = await Campus.find(campusFilter).sort({ isMain: -1, code: 1 }).lean();
    if (campuses.length === 0) {
      console.log('  [info] No campuses found matching criteria. Creating default Main Campus...');
      if (!options.dryRun) {
        const defaultCampus = await Campus.create({
          schoolId: school._id,
          name: 'Main Campus',
          code: 'MAIN',
          isMain: true,
          status: 'ACTIVE',
        });
        campuses.push(defaultCampus.toObject());
      }
    }

    console.log(`Found ${campuses.length} campus(es):`);
    campuses.forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.name} [Code: ${c.code || 'N/A'}, ID: ${c._id}${c.isMain ? ' - MAIN' : ''}]`);
    });

    const hasMultipleCampuses = campuses.length > 1;
    const classroomsCount = Math.max(0, options.count - options.labs);
    const labsCount = Math.min(options.count, options.labs);

    let grandTotalCreated = 0;
    let grandTotalSkipped = 0;
    let grandTotalUpdated = 0;

    // 3. Process Each Campus
    for (const campus of campuses) {
      console.log(`\nProcessing Campus: ${campus.name} (${campus.code})...`);

      if (options.clean) {
        if (options.dryRun) {
          console.log(`  [dry-run] Would delete existing rooms for campus ${campus.name}`);
        } else {
          const deleteRes = await Room.deleteMany({ schoolId: school._id, campusId: campus._id });
          console.log(`  [clean] Removed ${deleteRes.deletedCount} existing rooms for campus ${campus.name}.`);
        }
      }

      // Existing rooms in school to avoid duplicate key error on { schoolId, name }
      const existingRooms = await Room.find({ schoolId: school._id }).lean();
      const existingNames = new Set(existingRooms.map((r) => r.name.toLowerCase()));
      const campusExistingMap = new Map();
      existingRooms
        .filter((r) => String(r.campusId) === String(campus._id))
        .forEach((r) => campusExistingMap.set(r.name.toLowerCase(), r));

      const roomsToInsert = [];
      let campusCreated = 0;
      let campusUpdated = 0;
      let campusSkipped = 0;

      for (let i = 0; i < options.count; i++) {
        const roomNum = options.start + i;
        const isLab = i >= classroomsCount;
        const labIndex = isLab ? i - classroomsCount : -1;

        const roomName = buildRoomName(
          campus,
          roomNum,
          isLab,
          labIndex,
          options.naming,
          hasMultipleCampuses
        );

        const lowerName = roomName.toLowerCase();

        if (campusExistingMap.has(lowerName)) {
          // Already exists in this campus
          const existing = campusExistingMap.get(lowerName);
          if (!options.dryRun && (existing.isLab !== isLab || existing.status !== 'ACTIVE')) {
            await Room.updateOne(
              { _id: existing._id },
              { $set: { isLab, status: 'ACTIVE', capacity: options.capacity } }
            );
            campusUpdated++;
          } else {
            campusSkipped++;
          }
          continue;
        }

        if (existingNames.has(lowerName)) {
          // Exists under another campus; disambiguate
          const disambiguatedName = `${campus.code || 'CAMPUS'}-${roomName}`;
          roomsToInsert.push({
            schoolId: school._id,
            campusId: campus._id,
            name: disambiguatedName,
            capacity: options.capacity,
            isLab,
            status: 'ACTIVE',
          });
          existingNames.add(disambiguatedName.toLowerCase());
          campusCreated++;
          continue;
        }

        roomsToInsert.push({
          schoolId: school._id,
          campusId: campus._id,
          name: roomName,
          capacity: options.capacity,
          isLab,
          status: 'ACTIVE',
        });
        existingNames.add(lowerName);
        campusCreated++;
      }

      if (options.dryRun) {
        console.log(`  [dry-run] Would create ${roomsToInsert.length} rooms (${classroomsCount} classrooms, ${labsCount} labs).`);
        console.log(`    Sample Classrooms: ${roomsToInsert.slice(0, 3).map((r) => r.name).join(', ')} ...`);
        console.log(`    Sample Labs:       ${roomsToInsert.filter((r) => r.isLab).slice(0, 3).map((r) => r.name).join(', ')} ...`);
      } else if (roomsToInsert.length > 0) {
        await Room.insertMany(roomsToInsert, { ordered: false });
        console.log(`  [success] Created ${roomsToInsert.length} rooms (${classroomsCount} classrooms, ${labsCount} labs).`);
        if (campusUpdated > 0) console.log(`  [updated] Updated ${campusUpdated} existing rooms.`);
        if (campusSkipped > 0) console.log(`  [skipped] ${campusSkipped} rooms already existed.`);
      } else {
        console.log(`  [info] All ${options.count} rooms already exist for this campus.`);
      }

      grandTotalCreated += campusCreated;
      grandTotalUpdated += campusUpdated;
      grandTotalSkipped += campusSkipped;
    }

    console.log('\n' + '='.repeat(70));
    console.log('Seeding Summary:');
    console.log(`  Total Campuses:         ${campuses.length}`);
    console.log(`  Total Rooms Created:    ${grandTotalCreated}`);
    console.log(`  Total Rooms Updated:    ${grandTotalUpdated}`);
    console.log(`  Total Rooms Unchanged:  ${grandTotalSkipped}`);
    console.log('='.repeat(70));
    console.log('Done!');
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

main().catch((err) => {
  console.error('\n[fatal] Script failed:', err);
  process.exit(1);
});
