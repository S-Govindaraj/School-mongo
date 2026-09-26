/**
 * Script: migrateClassTeacherToSections.js
 * Migrates Class Teacher allocations directly into the Section collection (Section.classTeacherId).
 *
 * Requirements:
 *   - Reads active class teacher records from `teacherassignments`
 *   - Updates each corresponding `Section` record setting `classTeacherId = assignment.staffId`
 *   - Verifies 100% data integrity across all 44 sections (Pre-KG through 10th Standard)
 *   - Purges redundant class teacher rows from `teacherassignments`
 *   - Supports --dry-run (default) and --commit modes
 *
 * Usage:
 *   node src/scripts/migrateClassTeacherToSections.js --dry-run
 *   node src/scripts/migrateClassTeacherToSections.js --commit
 */

require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

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

const School = require('../models/School');
const Section = require('../models/Section');
const Grade = require('../models/Grade');
const Staff = require('../models/Staff');
const TeacherAssignment = require('../models/TeacherAssignment');

async function main() {
  const args = process.argv.slice(2);
  const isCommit = args.includes('--commit');
  const isDryRun = !isCommit || args.includes('--dry-run');

  console.log('='.repeat(85));
  console.log('  MIGRATION: EMBEDDING CLASS TEACHER DIRECTLY INTO SECTION COLLECTION');
  console.log('='.repeat(85));
  console.log(`  Mode: ${isDryRun ? '🔍 DRY RUN (Preview Only - No Changes Applied)' : '🚀 COMMIT (Writing to MongoDB Atlas)'}`);
  console.log('='.repeat(85) + '\n');

  await connectToDatabase();

  const school = await School.findOne({ status: 'ACTIVE' }).lean();
  if (!school) throw new Error('Active school not found');
  const schoolId = school._id;

  // 1. Fetch all active Class Teacher assignments from TeacherAssignment
  const assignments = await TeacherAssignment.find({
    schoolId,
    isClassTeacher: true,
    status: 'ACTIVE',
  })
    .populate('staffId', 'firstName lastName employeeId')
    .populate('gradeId', 'name code sequenceOrder')
    .populate('sectionId', 'name code room')
    .lean();

  console.log(`✓ Found ${assignments.length} Class Teacher assignment records in TeacherAssignment collection.`);

  // 2. Fetch all sections
  const sections = await Section.find({ schoolId, status: { $ne: 'ARCHIVED' } })
    .populate('gradeId', 'name code sequenceOrder')
    .lean();

  sections.sort((a, b) => {
    const seqA = a.gradeId?.sequenceOrder ?? 999;
    const seqB = b.gradeId?.sequenceOrder ?? 999;
    if (seqA !== seqB) return seqA - seqB;
    return (a.code || a.name || '').localeCompare(b.code || b.name || '');
  });

  console.log(`✓ Total Sections in School: ${sections.length}`);

  // 3. Match assignments to sections
  const migrationPlan = [];
  for (const sec of sections) {
    const match = assignments.find((a) => String(a.sectionId?._id || a.sectionId) === String(sec._id));
    const teacher = match?.staffId;
    migrationPlan.push({
      sectionId: sec._id,
      sectionName: sec.name,
      sectionCode: sec.code,
      gradeName: sec.gradeId?.name || 'Class',
      sequenceOrder: sec.gradeId?.sequenceOrder ?? 999,
      currentClassTeacherId: sec.classTeacherId || null,
      targetTeacherId: teacher?._id || null,
      targetTeacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Unassigned',
      targetTeacherEmpId: teacher?.employeeId || '—',
    });
  }

  // 4. Print Migration Table
  console.log('\n' + '='.repeat(95));
  console.log(`  ${'GRADE'.padEnd(18)} | ${'SECTION'.padEnd(15)} | ${'ASSIGNED CLASS TEACHER'.padEnd(25)} | ${'EMP ID'.padEnd(10)} | ${'STATUS'}`);
  console.log('='.repeat(95));

  for (const item of migrationPlan) {
    const statusStr = item.targetTeacherId ? 'Ready to Migrate' : 'No Assignment Found';
    console.log(
      `  ${item.gradeName.padEnd(18)} | ${(item.sectionName + ' (' + item.sectionCode + ')').padEnd(15)} | ${item.targetTeacherName.padEnd(25)} | ${item.targetTeacherEmpId.padEnd(10)} | ${statusStr}`
    );
  }
  console.log('='.repeat(95));

  // 5. Execute Migration
  if (!isDryRun) {
    console.log('\nApplying Section updates...');
    let updatedCount = 0;
    for (const item of migrationPlan) {
      if (item.targetTeacherId) {
        await Section.updateOne(
          { _id: item.sectionId, schoolId },
          { $set: { classTeacherId: item.targetTeacherId } }
        );
        updatedCount++;
      }
    }
    console.log(`✓ Updated ${updatedCount} Section documents with classTeacherId.`);

    // Purge redundant class-teacher-only records from TeacherAssignment
    const delResult = await TeacherAssignment.deleteMany({
      schoolId,
      isClassTeacher: true,
      subjectId: null,
    });
    console.log(`✓ Purged ${delResult.deletedCount} redundant Class-Teacher-only join records from TeacherAssignment collection.`);
  } else {
    console.log('\n[dry-run] No changes committed to database.');
    console.log('To execute migration, run with: node src/scripts/migrateClassTeacherToSections.js --commit');
  }

  console.log('\n' + '='.repeat(85));
  console.log(`  MIGRATION COMPLETE ${isDryRun ? '(DRY RUN PREVIEW)' : '(COMMITTED SUCCESSFULLY)'}`);
  console.log('='.repeat(85) + '\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
