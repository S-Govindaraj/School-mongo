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

const STAFF_PERMISSIONS = [
  {
    module: 'People & Staff',
    action: 'view',
    code: 'staff_view',
    name: 'View Teachers & Staff',
    description: 'View staff directory, employee profiles and dossier details',
  },
  {
    module: 'People & Staff',
    action: 'create',
    code: 'staff_create',
    name: 'Create Staff Member',
    description: 'Register and create new staff members and teachers',
  },
  {
    module: 'People & Staff',
    action: 'edit',
    code: 'staff_edit',
    name: 'Edit Staff Member',
    description: 'Modify staff member profiles, credentials, department and qualifications',
  },
  {
    module: 'People & Staff',
    action: 'active',
    code: 'staff_active',
    name: 'Activate Staff Member',
    description: 'Activate inactive staff members and restore their system profiles',
  },
  {
    module: 'People & Staff',
    action: 'inactive',
    code: 'staff_inactive',
    name: 'Deactivate Staff Member',
    description: 'Deactivate staff members and disable their active roles',
  },
  {
    module: 'People & Staff',
    action: 'manage',
    code: 'staff_manage',
    name: 'Manage Teachers & Staff',
    description: 'Full administrative access to manage staff directory and member lifecycles',
  },
];

const IMPLIED_BY = {
  staff_view: ['staff_view', 'teacher_view', 'staff_manage', 'teacher_manage'],
  staff_create: ['staff_manage', 'teacher_create', 'teacher_manage'],
  staff_edit: ['staff_manage', 'teacher_edit', 'teacher_manage'],
  staff_active: ['staff_manage', 'teacher_delete', 'teacher_active', 'teacher_manage'],
  staff_inactive: ['staff_manage', 'teacher_delete', 'teacher_inactive', 'teacher_manage'],
  staff_manage: ['staff_manage', 'teacher_manage'],
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB successfully.');

  console.log('\n--- Step 1: Upsert Staff Permissions in DB ---');
  for (const perm of STAFF_PERMISSIONS) {
    const existing = await Permission.findOne({ code: perm.code });
    if (existing) {
      console.log(`  = already exists: ${perm.code} -> updating metadata`);
      if (!DRY_RUN) {
        existing.name = perm.name;
        existing.description = perm.description;
        existing.action = perm.action;
        existing.module = perm.module;
        await existing.save();
      }
    } else {
      console.log(`  + ${DRY_RUN ? '[dry-run] would create' : 'creating'}: ${perm.code} (${perm.name})`);
      if (!DRY_RUN) {
        await Permission.create(perm);
      }
    }
  }

  console.log('\n--- Step 2: Grant Permissions to Existing Roles (additive only) ---');
  const roles = await Role.find({});
  for (const role of roles) {
    const current = new Set(role.permissions || []);
    if (current.has('*')) {
      console.log(`  = Role "${role.name}" (${role.code}): has wildcard '*', skipping`);
      continue;
    }

    const toAdd = [];
    for (const perm of STAFF_PERMISSIONS) {
      if (current.has(perm.code)) continue;
      const impliedList = IMPLIED_BY[perm.code] || [];
      const alreadyHasImplied = impliedList.some((alias) => current.has(alias));
      if (alreadyHasImplied) {
        toAdd.push(perm.code);
      }
    }

    if (!toAdd.length) {
      console.log(`  = Role "${role.name}" (${role.code}): no changes needed`);
      continue;
    }

    console.log(`  + Role "${role.name}" (${role.code}): adding permissions: ${toAdd.join(', ')}`);
    if (!DRY_RUN) {
      role.permissions = Array.from(new Set([...(role.permissions || []), ...toAdd]));
      await role.save();
    }
  }

  console.log('\nMigration completed successfully!');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
