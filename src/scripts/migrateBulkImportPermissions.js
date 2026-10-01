require('dotenv').config();
const dns = require('dns');

if (process.env.MONGODB_DNS_SERVERS) {
  const dnsServers = process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim());
  dns.setServers(dnsServers);
} else {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
  } catch (_) {}
}

const mongoose = require('mongoose');
const Permission = require('../models/Permission');
const Role = require('../models/Role');

const DRY_RUN = process.argv.includes('--dry-run');

const BULK_IMPORT_PERMISSIONS = [
  {
    module: 'Student Management',
    action: 'import',
    code: 'guardian_import',
    name: 'Bulk Import Parents & Guardians',
    description: 'Bulk import parent and guardian profiles with student links from Excel spreadsheets',
  },
  {
    module: 'People & Staff',
    action: 'import',
    code: 'staff_import',
    name: 'Bulk Import Staff & Teachers',
    description: 'Bulk import teaching faculty and staff members from Excel spreadsheets',
  },
  {
    module: 'Academic Setup',
    action: 'import',
    code: 'academic_year_import',
    name: 'Bulk Import Academic Years',
    description: 'Bulk import academic calendar years from Excel spreadsheets',
  },
  {
    module: 'Academic Setup',
    action: 'import',
    code: 'academic_term_import',
    name: 'Bulk Import Academic Terms',
    description: 'Bulk import academic terms and semester divisions from Excel spreadsheets',
  },
  {
    module: 'Academic Setup',
    action: 'import',
    code: 'grade_import',
    name: 'Bulk Import Grades / Classes',
    description: 'Bulk import grades, classes, and educational wings from Excel spreadsheets',
  },
  {
    module: 'Academic Setup',
    action: 'import',
    code: 'section_import',
    name: 'Bulk Import Sections',
    description: 'Bulk import class sections, room allocations, and teacher assignments from Excel spreadsheets',
  },
  {
    module: 'Academic Setup',
    action: 'import',
    code: 'subject_import',
    name: 'Bulk Import Master Subjects',
    description: 'Bulk import curriculum subjects and classification types from Excel spreadsheets',
  },
];

const IMPLIED_BY = {
  guardian_import: ['guardian_manage', 'student_import'],
  staff_import: ['staff_manage'],
  academic_year_import: ['academic_year_manage'],
  academic_term_import: ['academic_term_manage', 'academic_year_manage'],
  grade_import: ['grade_manage'],
  section_import: ['section_manage', 'grade_manage'],
  subject_import: ['subject_manage'],
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  console.log('\n--- Step 1: Bulk Import Permission Documents ---');
  for (const perm of BULK_IMPORT_PERMISSIONS) {
    const existing = await Permission.findOne({ code: perm.code }).lean();
    if (existing) {
      console.log(`  = already exists: ${perm.code}`);
      continue;
    }
    console.log(`  + ${DRY_RUN ? '[dry-run] would create' : 'creating'}: ${perm.code}`);
    if (!DRY_RUN) await Permission.create(perm);
  }

  console.log('\n--- Step 2: Role Permission Grants (additive only) ---');
  const roles = await Role.find({});
  for (const role of roles) {
    const current = new Set(role.permissions || []);
    if (current.has('*')) {
      console.log(`  = ${role.code}: has wildcard '*', skipping`);
      continue;
    }

    const toAdd = [];
    const isPrincipal = role.code === 'PRINCIPAL' || role.code === 'VICE_PRINCIPAL';

    for (const perm of BULK_IMPORT_PERMISSIONS) {
      if (current.has(perm.code)) continue;

      if (isPrincipal) {
        toAdd.push(perm.code);
        continue;
      }

      const impliedBy = IMPLIED_BY[perm.code] || [];
      const alreadyImplicitlyAllowed = impliedBy.some((alias) => current.has(alias));
      if (alreadyImplicitlyAllowed) toAdd.push(perm.code);
    }

    if (!toAdd.length) {
      console.log(`  = ${role.code}: no changes`);
      continue;
    }

    console.log(`  + ${role.code}: adding ${toAdd.length} permissions: ${toAdd.join(', ')}`);
    if (!DRY_RUN) {
      role.permissions = Array.from(new Set([...(role.permissions || []), ...toAdd]));
      await role.save();
    }
  }

  console.log('\n✅ Bulk Import permissions migration finished successfully!');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
