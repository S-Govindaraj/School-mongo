/**
 * Migrate: grant attendance_view_all to existing admin-tier roles
 * -----------------------------------------------------------------
 * `attendance_view_all` (Bypass class-teacher section scoping — view/mark/
 * correct any section's attendance) was added to the Permission catalog
 * and to seedDatabase.js's role definitions after this database was first
 * seeded, so roles created by that earlier run never got it — even
 * "Super Administrator", whose rolePerms = the full permission list at
 * seed time. A fresh `node seedDatabase.js` would wipe and pick it up
 * automatically; this script is the additive, non-destructive equivalent
 * for a database that already has real data in it.
 *
 * Eligibility is capability-based, not name-based: any role that already
 * holds attendance_mark + attendance_view + attendance_correct (i.e. is
 * already trusted to mark/view/correct attendance) gets attendance_view_all
 * added too, so it stops being scoped to "no section" / a single homeroom
 * and can see every grade and section — matching seedDatabase.js's own
 * SUPER_ADMIN / PRINCIPAL / VICE_PRINCIPAL branch. Roles that already carry
 * the '*' wildcard, or that don't have full attendance write access, are
 * left untouched.
 *
 * Usage (from devel/back):
 *   node src/scripts/migrateAttendanceViewAllPermission.js [--dry-run]
 */

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

const ATTENDANCE_VIEW_ALL_PERMISSION = {
  module: 'Attendance & Leave',
  action: 'view',
  code: 'attendance_view_all',
  name: "View All Sections' Attendance",
  description: "Bypass class-teacher section scoping — view/mark/correct any section's attendance, not just your own homeroom",
};

const REQUIRED_FOR_ELIGIBILITY = ['attendance_mark', 'attendance_view', 'attendance_correct'];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB successfully.');
  if (DRY_RUN) console.log('(dry run — no changes will be written)\n');

  console.log('--- Step 1: Ensure attendance_view_all exists in the Permission catalog ---');
  const existingPermission = await Permission.findOne({ code: ATTENDANCE_VIEW_ALL_PERMISSION.code });
  if (existingPermission) {
    console.log(`  = already exists: ${ATTENDANCE_VIEW_ALL_PERMISSION.code}`);
  } else {
    console.log(`  + ${DRY_RUN ? '[dry-run] would create' : 'creating'}: ${ATTENDANCE_VIEW_ALL_PERMISSION.code} (${ATTENDANCE_VIEW_ALL_PERMISSION.name})`);
    if (!DRY_RUN) await Permission.create(ATTENDANCE_VIEW_ALL_PERMISSION);
  }

  console.log('\n--- Step 2: Grant attendance_view_all to eligible roles (additive only) ---');
  const roles = await Role.find({});
  let grantedCount = 0;

  for (const role of roles) {
    const current = new Set(role.permissions || []);

    if (current.has('*')) {
      console.log(`  = Role "${role.name}" (${role.code}): has wildcard '*', skipping`);
      continue;
    }
    if (current.has(ATTENDANCE_VIEW_ALL_PERMISSION.code)) {
      console.log(`  = Role "${role.name}" (${role.code}): already has attendance_view_all`);
      continue;
    }
    const eligible = REQUIRED_FOR_ELIGIBILITY.every((code) => current.has(code));
    if (!eligible) {
      console.log(`  - Role "${role.name}" (${role.code}): not eligible (missing one of ${REQUIRED_FOR_ELIGIBILITY.join(', ')})`);
      continue;
    }

    console.log(`  + Role "${role.name}" (${role.code}): granting attendance_view_all`);
    if (!DRY_RUN) {
      role.permissions = [...(role.permissions || []), ATTENDANCE_VIEW_ALL_PERMISSION.code];
      await role.save();
    }
    grantedCount++;
  }

  console.log(`\n${DRY_RUN ? 'Would grant' : 'Granted'} attendance_view_all to ${grantedCount} role(s).`);
  console.log('Users with an affected role must log out and back in (or otherwise refresh their session/JWT) to pick up the new permission.');
  console.log('\nMigration completed successfully!');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
