/**
 * One-time, NON-destructive migration for the Examinations Phase 2
 * ("Reporting & Governance") correction workflow permissions. Safe to run
 * against a real, already-provisioned database — like migrateExamPermissions.js,
 * this script never deletes anything.
 *
 * What it does:
 *   1. Upserts the new Permission documents (exam_correction_view,
 *      exam_correction_request, exam_correction_approve) if they don't
 *      already exist — skips ones that do, never overwrites a Permission's
 *      name/description if an admin already edited it.
 *   2. Additively grants exam_correction_view/exam_correction_request to
 *      existing Roles, but ONLY to roles that would already pass the
 *      equivalent check today via the backend's PERMISSION_ALIASES fallback
 *      (middleware/auth.js) — i.e. any role that already holds exam_manage.
 *      This only makes an already-working implicit grant explicit; it never
 *      grants new access nobody effectively had before, and never removes
 *      any permission.
 *
 *      exam_correction_approve is DELIBERATELY EXCLUDED from this auto-grant
 *      step (it has no IMPLIED_BY entry below, matching that there is no
 *      PERMISSION_ALIASES entry for it either) — it gates the sensitive
 *      action of applying a correction to a published result on a LOCKED
 *      exam, bypassing the exam's normal edit guard, and must be assigned to
 *      a role explicitly, by hand, through Role management. This migration
 *      only creates the Permission document so an admin can find and grant
 *      it; it never grants it itself.
 *
 * Usage:
 *   node src/scripts/migratePhase2ExamPermissions.js            # apply
 *   node src/scripts/migratePhase2ExamPermissions.js --dry-run  # preview only, writes nothing
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
  { module: 'Examinations', action: 'view', code: 'exam_correction_view', name: 'View Result Corrections', description: 'View result correction requests and their status' },
  { module: 'Examinations', action: 'update', code: 'exam_correction_request', name: 'Request Result Correction', description: 'Request a correction to a student\'s marks on a locked exam' },
  { module: 'Examinations', action: 'approve', code: 'exam_correction_approve', name: 'Approve Result Correction', description: 'Approve or reject a result correction request, applying it to the published result (sensitive — must be granted explicitly per role)' },
];

// Mirrors backend/src/middleware/auth.js's PERMISSION_ALIASES for these codes
// exactly — a role only gets the new code added if it already holds
// exam_manage (meaning it was already, implicitly, authorized to perform the
// broader exam-management action, and by extension this narrower one).
// exam_correction_approve is NOT here — explicit-grant-only, no auto-grant.
const IMPLIED_BY = {
  exam_correction_view: ['exam_manage'],
  exam_correction_request: ['exam_manage'],
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
    console.log(`Examinations Phase 2 permission migration ${DRY_RUN ? '(DRY RUN — no writes will be made)' : ''}`);
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
