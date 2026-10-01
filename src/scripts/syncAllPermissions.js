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

const fs = require('fs');
const mongoose = require('mongoose');
const Permission = require('../models/Permission');
const Role = require('../models/Role');

async function sync() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Load canonical master permissions from seedDatabase.js
  const seedContent = fs.readFileSync('src/scripts/seedDatabase.js', 'utf8');
  const match = seedContent.match(/const permissionsData = (\[[\s\S]*?\n\];)/);
  if (!match) {
    throw new Error('Could not find permissionsData in seedDatabase.js');
  }
  const fn = new Function(match[0] + '; return permissionsData;');
  const seedPermissions = fn();

  console.log(`Found ${seedPermissions.length} permissions defined in seedDatabase.js`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const perm of seedPermissions) {
    const existing = await Permission.findOne({ code: perm.code });
    if (!existing) {
      await Permission.create({
        module: perm.module,
        action: perm.action,
        code: perm.code,
        name: perm.name,
        description: perm.description,
      });
      createdCount++;
      console.log(`  + Created permission: ${perm.code} (${perm.name})`);
    } else {
      // Update fields if name, action, or description changed
      let changed = false;
      if (existing.name !== perm.name) { existing.name = perm.name; changed = true; }
      if (existing.module !== perm.module) { existing.module = perm.module; changed = true; }
      if (existing.action !== perm.action) { existing.action = perm.action; changed = true; }
      if (existing.description !== perm.description) { existing.description = perm.description; changed = true; }
      if (changed) {
        await existing.save();
        updatedCount++;
      }
    }
  }

  console.log(`\n✅ Permissions sync complete: ${createdCount} created, ${updatedCount} updated.`);

  // Now ensure all roles have appropriate permissions
  const allDbPerms = await Permission.find({}).lean();
  const allCodes = allDbPerms.map((p) => p.code);

  const roles = await Role.find({});
  for (const role of roles) {
    const current = new Set(role.permissions || []);
    const isSuper = role.code === 'SUPER_ADMIN';
    const isPrincipal = role.code === 'PRINCIPAL' || role.code === 'VICE_PRINCIPAL';

    let toAdd = [];
    if (isSuper) {
      toAdd = allCodes.filter((c) => !current.has(c));
    } else if (isPrincipal) {
      toAdd = allCodes.filter((c) => !c.includes('settings') && !current.has(c));
    } else {
      // If role already has student_manage or student_create, grant student_import if appropriate
      if ((current.has('student_manage')) && !current.has('student_import')) {
        toAdd.push('student_import');
      }
    }

    if (toAdd.length > 0) {
      role.permissions = Array.from(new Set([...(role.permissions || []), ...toAdd]));
      await role.save();
      console.log(`  + Updated role ${role.code}: added ${toAdd.length} permissions (including ${toAdd.includes('student_import') ? 'student_import' : ''})`);
    }
  }

  console.log('\n🎉 Database permissions & roles fully synchronized!');
  await mongoose.disconnect();
}

sync().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
