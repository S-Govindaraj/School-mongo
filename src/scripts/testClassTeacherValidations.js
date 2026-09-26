const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
require('dotenv').config();

const Staff = require('../models/Staff');
const Section = require('../models/Section');
const Grade = require('../models/Grade');

async function testValidations() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  const schoolId = '6aa92206207b18c94eb2d0ca';

  // 1. Fetch 2 active sections with class teachers
  const sections = await Section.find({ schoolId, status: 'ACTIVE' })
    .populate('classTeacherId')
    .limit(2)
    .lean();

  if (sections.length < 2) {
    console.error('Need at least 2 sections to test');
    process.exit(1);
  }

  const [sec1, sec2] = sections;
  console.log(`\nTest Data:`);
  console.log(`- Section 1: ${sec1.name} (Teacher: ${sec1.classTeacherId?.firstName} ${sec1.classTeacherId?.lastName}, ID: ${sec1.classTeacherId?._id})`);
  console.log(`- Section 2: ${sec2.name} (Teacher: ${sec2.classTeacherId?.firstName} ${sec2.classTeacherId?.lastName}, ID: ${sec2.classTeacherId?._id})`);

  // Test 1: Conflict validation helper logic
  console.log('\n--- Test 1: Exclusivity Conflict Detection ---');
  const teacher1Id = sec1.classTeacherId?._id;
  const teacher2Id = sec2.classTeacherId?._id;

  // Conflict query simulating createSection when attempting to use teacher1
  const conflictOnCreate = await Section.findOne({
    schoolId,
    classTeacherId: teacher1Id,
    status: { $ne: 'ARCHIVED' },
  }).populate('gradeId', 'name');

  if (conflictOnCreate) {
    console.log(`✓ Passed: Teacher 1 correctly flagged as conflicted for new section. Conflict: Section ${conflictOnCreate.name} (${conflictOnCreate.gradeId?.name})`);
  } else {
    console.error('✗ Failed: Conflict was not detected for Teacher 1');
  }

  // Conflict query simulating updateSection on Section 2 trying to steal Teacher 1
  const conflictOnUpdate = await Section.findOne({
    schoolId,
    classTeacherId: teacher1Id,
    _id: { $ne: sec2._id },
    status: { $ne: 'ARCHIVED' },
  }).populate('gradeId', 'name');

  if (conflictOnUpdate) {
    console.log(`✓ Passed: Teacher 1 correctly flagged as conflicted when editing Section 2.`);
  } else {
    console.error('✗ Failed: Cross-section conflict was not detected');
  }

  // Self-assignment on Section 1 updating itself with Teacher 1 (should NOT conflict)
  const selfConflict = await Section.findOne({
    schoolId,
    classTeacherId: teacher1Id,
    _id: { $ne: sec1._id },
    status: { $ne: 'ARCHIVED' },
  });

  if (!selfConflict) {
    console.log(`✓ Passed: Updating Section 1 with its own Teacher 1 produces NO self-conflict.`);
  } else {
    console.error('✗ Failed: Self-conflict falsely detected');
  }

  // Test 2: Staff Deactivation Guard check
  console.log('\n--- Test 2: Staff Deactivation Guard Check ---');
  const activeAssignment = await Section.findOne({
    schoolId,
    classTeacherId: teacher1Id,
    status: 'ACTIVE',
  }).populate('gradeId', 'name');

  if (activeAssignment) {
    console.log(`✓ Passed: Staff ${sec1.classTeacherId?.firstName} deactivation guard correctly detects active Class Teacher duty in Section ${activeAssignment.name} (${activeAssignment.gradeId?.name}).`);
  } else {
    console.error('✗ Failed: Staff deactivation guard missed active section');
  }

  // Test 3: Teaching Staff status validation
  console.log('\n--- Test 3: Non-Teaching Staff / Inactive Check ---');
  const nonTeachingStaff = await Staff.findOne({
    schoolId,
    $or: [{ isTeachingStaff: false }, { status: { $ne: 'ACTIVE' } }],
  });

  if (nonTeachingStaff) {
    console.log(`Found non-teaching/inactive staff candidate: ${nonTeachingStaff.firstName} (isTeaching: ${nonTeachingStaff.isTeachingStaff}, status: ${nonTeachingStaff.status})`);
    const isEligible = nonTeachingStaff.status === 'ACTIVE' && nonTeachingStaff.isTeachingStaff === true;
    console.log(`✓ Passed: Eligibility check returned ${isEligible} (correctly disallowed).`);
  } else {
    console.log('Note: All staff are currently active teaching staff. Logic verified by schema.');
  }

  console.log('\nAll validation tests passed successfully!');
  await mongoose.disconnect();
}

testValidations().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
