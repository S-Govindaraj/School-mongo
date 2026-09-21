/**
 * One-time, NON-destructive migration for the Period `type` field
 * (INSTRUCTIONAL | BREAK | LUNCH). Safe to run against a real,
 * already-provisioned database — never deletes anything.
 *
 * Why this is needed: Mongoose schema defaults only apply when a document is
 * created or re-validated — they never retroactively backfill documents that
 * already exist in the database. Any Period created before this feature
 * shipped has no `type` field at all, which would make the new
 * instructional-vs-non-instructional classification (Periods tab KPIs, the
 * Smart Timetable Generator's period-selection step, capacity math) treat it
 * inconsistently until this backfill runs.
 *
 * What it does: for every Period document missing `type`, sets
 * `type: 'BREAK'` when `isBreak: true`, otherwise `type: 'INSTRUCTIONAL'` —
 * exactly mirroring the same derivation the model's own pre-validate hook
 * and periodController.js already use for new documents. It never touches
 * `isBreak` itself (already correct on existing documents) and never
 * distinguishes BREAK vs LUNCH for pre-existing data (that distinction did
 * not exist before this feature — an admin can re-classify any individual
 * Lunch period afterward via the normal Edit Period popup).
 *
 * Usage:
 *   node src/scripts/migratePeriodTypeField.js            # apply
 *   node src/scripts/migratePeriodTypeField.js --dry-run  # preview only, writes nothing
 */
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

if (process.env.MONGODB_DNS_SERVERS) {
  const dnsServers = process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim());
  dns.setServers(dnsServers);
} else {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
  } catch (_) {}
}

const Period = require('../models/Period');

const DRY_RUN = process.argv.includes('--dry-run');

async function backfillPeriodType() {
  console.log('\n--- Backfilling Period.type from Period.isBreak ---');

  const missingCount = await Period.countDocuments({ type: { $exists: false } });
  console.log(`  periods missing 'type': ${missingCount}`);
  if (!missingCount) {
    console.log('  nothing to do.');
    return;
  }

  if (DRY_RUN) {
    const breakCount = await Period.countDocuments({ type: { $exists: false }, isBreak: true });
    const instructionalCount = missingCount - breakCount;
    console.log(`  [dry-run] would set type='BREAK' on ${breakCount} period(s)`);
    console.log(`  [dry-run] would set type='INSTRUCTIONAL' on ${instructionalCount} period(s)`);
    return;
  }

  const breakRes = await Period.updateMany({ type: { $exists: false }, isBreak: true }, { $set: { type: 'BREAK' } });
  console.log(`  set type='BREAK' on ${breakRes.modifiedCount} period(s)`);

  const instructionalRes = await Period.updateMany({ type: { $exists: false } }, { $set: { type: 'INSTRUCTIONAL' } });
  console.log(`  set type='INSTRUCTIONAL' on ${instructionalRes.modifiedCount} period(s)`);
}

async function run() {
  try {
    console.log(`Period type backfill ${DRY_RUN ? '(DRY RUN — no writes will be made)' : ''}`);
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

    await backfillPeriodType();

    console.log(`\nDone.${DRY_RUN ? ' Re-run without --dry-run to apply these changes.' : ''}`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
