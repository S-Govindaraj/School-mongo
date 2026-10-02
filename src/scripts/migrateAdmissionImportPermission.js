require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const Permission = require('../models/Permission');
const Role = require('../models/Role');

const ADMISSION_IMPORT_PERMISSION = {
  module: 'Admissions & Enrollment',
  action: 'import',
  code: 'admission_import',
  name: 'Bulk Import Admissions',
  description: 'Bulk import student admission applications from Excel spreadsheets with validation and preview',
};

async function run() {
  await connectDB();
  console.log('Connected to MongoDB via connectDB.');

  console.log('\n--- Step 1: Ensure Permission Document Exists ---');
  let permDoc = await Permission.findOne({ code: ADMISSION_IMPORT_PERMISSION.code });
  if (permDoc) {
    console.log(`  = Permission "${ADMISSION_IMPORT_PERMISSION.code}" already exists in database.`);
  } else {
    permDoc = await Permission.create(ADMISSION_IMPORT_PERMISSION);
    console.log(`  + Created new permission: ${permDoc.code} (${permDoc.name})`);
  }

  console.log('\n--- Step 2: Grant Permission to Roles ---');
  const roles = await Role.find({});
  let updatedCount = 0;

  for (const role of roles) {
    const current = new Set(role.permissions || []);
    if (current.has('*')) {
      console.log(`  = Role "${role.name}" (${role.code}): has wildcard '*' permission.`);
      continue;
    }

    if (current.has(ADMISSION_IMPORT_PERMISSION.code)) {
      console.log(`  = Role "${role.name}" (${role.code}): already has '${ADMISSION_IMPORT_PERMISSION.code}'.`);
      continue;
    }

    // Grant to leadership and roles that can create/manage admissions
    const shouldGrant =
      role.code === 'PRINCIPAL' ||
      role.code === 'VICE_PRINCIPAL' ||
      role.code === 'ACADEMIC_DIRECTOR' ||
      role.code === 'ADMIN' ||
      role.code === 'SCHOOL_ADMIN' ||
      current.has('admission_create') ||
      current.has('admission_approve') ||
      current.has('admission_view') ||
      current.has('student_import');

    if (shouldGrant) {
      role.permissions = Array.from(new Set([...(role.permissions || []), ADMISSION_IMPORT_PERMISSION.code]));
      await role.save();
      console.log(`  + Granted '${ADMISSION_IMPORT_PERMISSION.code}' to role: "${role.name}" (${role.code})`);
      updatedCount++;
    } else {
      console.log(`  - Role "${role.name}" (${role.code}): not applicable.`);
    }
  }

  console.log(`\n✅ Finished! Updated ${updatedCount} role(s) with '${ADMISSION_IMPORT_PERMISSION.code}'.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
