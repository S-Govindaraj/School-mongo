const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
require('dotenv').config();

const User = require('../models/User');

// Resets EVERY user's password to one fixed value. Dry-run by default —
// pass --commit to actually write. Intended for dev/staging resets only;
// setting one known password for every account is a real security risk on
// any environment real users log into.
const NEW_PASSWORD = 'Sgovi@5697';

async function run() {
  const commit = process.argv.includes('--commit');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  const totalUsers = await User.countDocuments({});
  console.log(`Found ${totalUsers} user(s).`);

  if (!commit) {
    console.log('\nDry run only — no changes made. Re-run with --commit to apply.');
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);
  const result = await User.updateMany({}, { $set: { password: hashedPassword } });

  console.log(`✓ Updated ${result.modifiedCount} of ${totalUsers} user(s) to the new password.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error resetting passwords:', err);
  process.exit(1);
});
