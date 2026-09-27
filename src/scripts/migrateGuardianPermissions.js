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

const GUARDIAN_PERMISSIONS = [
  {
    module: 'Student Management',
    action: 'view',
    code: 'guardian_view',
    name: 'View Parents & Guardians',
    description: 'View parent and guardian directory and member profiles',
  },
  {
    module: 'Student Management',
    action: 'create',
    code: 'guardian_create',
    name: 'Create Guardian',
    description: 'Register and create new parent and guardian profiles',
  },
  {
    module: 'Student Management',
    action: 'edit',
    code: 'guardian_edit',
    name: 'Edit Guardian',
    description: 'Modify parent and guardian profiles and contact information',
  },
  {
    module: 'Student Management',
    action: 'active',
    code: 'guardian_active',
    name: 'Activate Guardian',
    description: 'Activate inactive parent and guardian profiles',
  },
  {
    module: 'Student Management',
    action: 'inactive',
    code: 'guardian_inactive',
    name: 'Deactivate Guardian',
    description: 'Deactivate parent and guardian profiles',
  },
  {
    module: 'Student Management',
    action: 'manage',
    code: 'guardian_manage',
    name: 'Manage Parents & Guardians',
    description: 'Full administrative access to manage parent and guardian directory',
  },
];

const IMPLIED_BY = {
  guardian_view: ['guardian_view', 'guardian_manage', 'guardian_update', 'admin_manage'],
  guardian_create: ['guardian_create', 'guardian_manage', 'admin_manage'],
  guardian_edit: ['guardian_edit', 'guardian_update', 'guardian_manage', 'admin_manage'],
  guardian_active: ['guardian_active', 'guardian_update', 'guardian_manage', 'admin_manage'],
  guardian_inactive: ['guardian_inactive', 'guardian_delete', 'guardian_update', 'guardian_manage', 'admin_manage'],
  guardian_manage: ['guardian_manage', 'admin_manage'],
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB successfully.');

  console.log('\n--- Step 1: Upsert Guardian Permissions in DB ---');
  for (const perm of GUARDIAN_PERMISSIONS) {
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
    for (const perm of GUARDIAN_PERMISSIONS) {
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
