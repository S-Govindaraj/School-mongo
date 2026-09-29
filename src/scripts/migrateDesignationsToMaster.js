/**
 * Migrates Staff.designation from a free-text string to a proper Designation
 * master collection reference (Staff.designationId).
 *
 * For every school found in the Staff collection:
 *   1. Collects the distinct `designation` string values currently in use.
 *   2. Upserts one Designation document per distinct value (skips ones that
 *      already exist, matched case-insensitively by name).
 *   3. Sets `designationId` on every Staff document to point at the matching
 *      Designation doc (the `designation` string itself is left untouched —
 *      it stays as the display fallback, same as `department`/`departmentId`).
 *
 * SAFE BY DEFAULT: runs in dry-run/report-only mode unless --commit is
 * passed. Always run once without --commit first and review the report.
 *
 * Usage:
 *   node src/scripts/migrateDesignationsToMaster.js              # dry run
 *   node src/scripts/migrateDesignationsToMaster.js --commit      # writes data
 *   node src/scripts/migrateDesignationsToMaster.js --commit --schoolId=<id>
 */
const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
require('dotenv').config();

const Staff = require('../models/Staff');
const Designation = require('../models/Designation');

const COMMIT = process.argv.includes('--commit');
const schoolIdArg = process.argv.find((a) => a.startsWith('--schoolId='));
const ONLY_SCHOOL_ID = schoolIdArg ? schoolIdArg.split('=')[1] : null;

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const codeFromName = (name) =>
  String(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');
  console.log(COMMIT ? '*** COMMIT MODE — this will write data ***' : '(dry run — no changes will be written)');

  const staffFilter = ONLY_SCHOOL_ID ? { schoolId: ONLY_SCHOOL_ID } : {};
  const schoolIds = await Staff.distinct('schoolId', staffFilter);
  console.log(`Found ${schoolIds.length} school(s) with staff records.\n`);

  let totalCreated = 0;
  let totalReused = 0;
  let totalStaffUpdated = 0;

  for (const schoolId of schoolIds) {
    const distinctNames = (await Staff.distinct('designation', { schoolId }))
      .map((n) => String(n || '').trim())
      .filter(Boolean);

    console.log(`--- School ${schoolId}: ${distinctNames.length} distinct designation(s) ---`);

    const nameToDesignationId = new Map();

    for (const name of distinctNames) {
      const existing = await Designation.findOne({ schoolId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') }).lean();
      if (existing) {
        console.log(`  = reuse   "${name}" -> ${existing._id}`);
        nameToDesignationId.set(name.toLowerCase(), existing._id);
        totalReused++;
        continue;
      }

      console.log(`  + create  "${name}"${COMMIT ? '' : ' (dry run — not created)'}`);
      if (COMMIT) {
        const created = await Designation.create({
          schoolId,
          name,
          code: codeFromName(name),
          status: 'ACTIVE',
        });
        nameToDesignationId.set(name.toLowerCase(), created._id);
      }
      totalCreated++;
    }

    if (!COMMIT) continue; // can't backfill designationId without real Designation _ids

    for (const [nameLower, designationId] of nameToDesignationId) {
      const result = await Staff.updateMany(
        { schoolId, designation: new RegExp(`^${escapeRegex(nameLower)}$`, 'i'), designationId: null },
        { $set: { designationId } }
      );
      totalStaffUpdated += result.modifiedCount;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Designations reused: ${totalReused}`);
  console.log(`Designations ${COMMIT ? 'created' : 'to be created'}: ${totalCreated}`);
  if (COMMIT) {
    console.log(`Staff records backfilled with designationId: ${totalStaffUpdated}`);
  } else {
    console.log('\nDry run complete. Re-run with --commit to write this data.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error migrating designations:', err);
  process.exit(1);
});
