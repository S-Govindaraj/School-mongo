/**
 * One-time, NON-destructive migration for the Smart Timetable Generator
 * feature (Rooms + Regenerate/Lock/Publish). Safe to run against a real,
 * already-provisioned database — unlike seedDatabase.js, this script never
 * deletes anything.
 *
 * What it does:
 *   1. Upserts the 5 new Permission documents (timetable_generate,
 *      timetable_publish, timetable_lock, room_view, room_manage) if they
 *      don't already exist — skips ones that do, never overwrites a
 *      Permission's name/description if an admin already edited it.
 *   2. Additively grants those new permission codes to existing Roles, but
 *      ONLY to roles that would already pass the equivalent check today via
 *      the backend's PERMISSION_ALIASES fallback (middleware/auth.js) — i.e.
 *      this only makes an already-working implicit grant explicit. It never
 *      grants new access nobody effectively had before, and never removes
 *      any existing permission from any role.
 *   3. Backfills existing Timetable documents that predate this feature with
 *      source: 'MANUAL' and isLocked: false where those fields are missing
 *      (they're optional/defaulted for NEW documents, but Mongoose defaults
 *      never apply retroactively to documents already in the database).
 *
 * Usage:
 *   node src/scripts/migrateTimetableGeneratorPermissions.js            # apply
 *   node src/scripts/migrateTimetableGeneratorPermissions.js --dry-run  # preview only, writes nothing
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
const Timetable = require('../models/Timetable');

const DRY_RUN = process.argv.includes('--dry-run');

const NEW_PERMISSIONS = [
  { module: 'Academic Operations', action: 'manage', code: 'timetable_generate', name: 'Generate Timetable', description: 'Run the Smart Timetable Generator, including regenerate section/subject' },
  { module: 'Academic Operations', action: 'manage', code: 'timetable_publish', name: 'Publish Timetable', description: 'Publish a saved/generated timetable as the official schedule' },
  { module: 'Academic Operations', action: 'manage', code: 'timetable_lock', name: 'Lock Timetable', description: 'Lock or unlock individual timetable slots to protect them from edits and regeneration' },
  { module: 'Academic Operations', action: 'view', code: 'room_view', name: 'View Rooms', description: 'View rooms and labs used for scheduling' },
  { module: 'Academic Operations', action: 'manage', code: 'room_manage', name: 'Manage Rooms', description: 'Configure rooms and labs' },
];

// Mirrors backend/src/middleware/auth.js's PERMISSION_ALIASES for these same
// codes exactly — a role only gets a new code added if it already holds one
// of these existing codes (meaning it was already, implicitly, authorized).
const IMPLIED_BY = {
  timetable_generate: ['timetable_manage'],
  timetable_publish: ['timetable_manage'],
  timetable_lock: ['timetable_manage'],
  room_view: ['room_manage', 'timetable_manage', 'period_manage'],
  room_manage: ['timetable_manage'],
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

async function backfillTimetableEntries() {
  console.log('\n--- Step 3: Backfill existing Timetable entries ---');
  const sourceFilter = { source: { $exists: false } };
  const lockFilter = { isLocked: { $exists: false } };

  const sourceCount = await Timetable.countDocuments(sourceFilter);
  const lockCount = await Timetable.countDocuments(lockFilter);
  console.log(`  entries missing 'source': ${sourceCount}`);
  console.log(`  entries missing 'isLocked': ${lockCount}`);

  if (DRY_RUN) {
    console.log('  [dry-run] no writes performed.');
    return;
  }

  if (sourceCount) {
    const res = await Timetable.updateMany(sourceFilter, { $set: { source: 'MANUAL' } });
    console.log(`  set source='MANUAL' on ${res.modifiedCount} entr${res.modifiedCount === 1 ? 'y' : 'ies'}`);
  }
  if (lockCount) {
    const res = await Timetable.updateMany(lockFilter, { $set: { isLocked: false } });
    console.log(`  set isLocked=false on ${res.modifiedCount} entr${res.modifiedCount === 1 ? 'y' : 'ies'}`);
  }
}

async function run() {
  try {
    console.log(`Smart Timetable Generator migration ${DRY_RUN ? '(DRY RUN — no writes will be made)' : ''}`);
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
    await backfillTimetableEntries();

    console.log(`\nDone.${DRY_RUN ? ' Re-run without --dry-run to apply these changes.' : ''}`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
