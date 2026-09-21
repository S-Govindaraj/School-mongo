/**
 * One-time, NON-destructive migration for the Student 360 feature.
 * Safe to run against a real, already-provisioned database — unlike
 * seedDatabase.js, this script never deletes anything.
 *
 * What it does:
 *   1. Upserts the new Permission documents (exam_result_view,
 *      discipline_view, medical_view) if they don't already exist — skips
 *      ones that do, never overwrites a Permission's name/description if an
 *      admin already edited it.
 *   2. Additively grants exam_result_view to existing Roles, but ONLY to
 *      roles that would already pass the equivalent check today via the
 *      backend's PERMISSION_ALIASES fallback (middleware/auth.js) — i.e.
 *      any role that already holds student_view. This only makes an
 *      already-working implicit grant explicit; it never grants new access
 *      nobody effectively had before, and never removes any permission.
 *
 *      discipline_view and medical_view are DELIBERATELY EXCLUDED from this
 *      auto-grant step (they have no IMPLIED_BY entry below, matching that
 *      there is no PERMISSION_ALIASES entry for them either) — they are the
 *      highest-sensitivity data in this feature and must be assigned to a
 *      role explicitly, by hand, through Role management. This migration
 *      only creates the Permission documents so an admin can find and grant
 *      them; it never grants them itself.
 *
 * Usage:
 *   node src/scripts/migrateStudent360Permissions.js            # apply
 *   node src/scripts/migrateStudent360Permissions.js --dry-run  # preview only, writes nothing
 */
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

// Exact same DNS + connection logic as src/config/db.js
if (process.env.MONGODB_DNS_SERVERS) {
  const dnsServers = process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim());
  dns.setServers(dnsServers);
} else {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
  } catch (_) {}
}

const Permission = require('../models/Permission');
const Role = require('../models/Role');

const DRY_RUN = process.argv.includes('--dry-run');

const NEW_PERMISSIONS = [
  { module: 'Student Management', action: 'view', code: 'exam_result_view', name: 'View Exam Results', description: 'View student exam results in the Student 360 profile' },
  { module: 'Student Management', action: 'view', code: 'discipline_view', name: 'View Discipline Records', description: 'View student discipline incidents and disciplinary actions (sensitive — must be granted explicitly per role)' },
  { module: 'Student Management', action: 'view', code: 'medical_view', name: 'View Medical Records', description: 'View student health profile and medical visit history (sensitive — must be granted explicitly per role)' },
];

// Mirrors backend/src/middleware/auth.js's PERMISSION_ALIASES for this code
// exactly — a role only gets the new code added if it already holds
// student_view (meaning it was already, implicitly, authorized to see a
// student's profile, and by extension the new exam-results tab on it).
const IMPLIED_BY = {
  exam_result_view: ['student_view'],
};

async function migratePermissions() {
  console.log('\n--- Step 1: Permission documents ---');
  for (const perm of NEW_PERMISSIONS) {
    const existing = await Permission.findOne({ code: perm.code }).lean();
    if (existing) {
      console.log(`  = already exists: ${perm.code}`);
      continue;
    }
    console.log(`  + ${DRY_RUN ? '[dry-run] would create' : 'creating'}: ${perm.code}`);
    if (!DRY_RUN) await Permission.create(perm);
  }
}

async function migrateRolePermissions() {
  console.log('\n--- Step 2: Role permission grants (additive only) ---');
  const roles = await Role.find({}).lean();
  let updatedCount = 0;

  for (const role of roles) {
    const current = new Set(role.permissions || []);
    if (current.has('*')) {
      console.log(`  = ${role.code}: has wildcard '*', nothing to add`);
      continue;
    }

    const toAdd = [];
    for (const perm of NEW_PERMISSIONS) {
      if (current.has(perm.code)) continue;
      const impliedBy = IMPLIED_BY[perm.code] || [];
      const alreadyImplicitlyAllowed = impliedBy.some((alias) => current.has(alias));
      if (alreadyImplicitlyAllowed) toAdd.push(perm.code);
    }

    if (!toAdd.length) {
      console.log(`  = ${role.code}: no change (not implicitly covered, or already explicit)`);
      continue;
    }

    console.log(`  + ${DRY_RUN ? '[dry-run] would add' : 'adding'} to ${role.code}: ${toAdd.join(', ')}`);
    updatedCount++;
    if (!DRY_RUN) {
      await Role.updateOne({ _id: role._id }, { $addToSet: { permissions: { $each: toAdd } } });
    }
  }

  console.log(`  ${updatedCount} role(s) ${DRY_RUN ? 'would be' : 'were'} updated.`);
}

async function run() {
  try {
    console.log(`Student 360 migration ${DRY_RUN ? '(DRY RUN — no writes will be made)' : ''}`);
    await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: false,
      serverSelectionTimeoutMS: 30000,
      maxPoolSize: 20,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
    });
    console.log('Connected to MongoDB.');

    await migratePermissions();
    await migrateRolePermissions();

    console.log(`\nDone.${DRY_RUN ? ' Re-run without --dry-run to apply these changes.' : ''}`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
