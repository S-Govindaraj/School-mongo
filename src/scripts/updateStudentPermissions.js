const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
  const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));

  // 1. Update student_view description
  await Permission.updateOne(
    { code: 'student_view' },
    { $set: { description: 'View Student page side bar gate and view action button' } }
  );
  console.log('Updated student_view description');

  // 2. Update student_status_change to "Active and Inactive"
  await Permission.updateOne(
    { code: 'student_status_change' },
    {
      $set: {
        name: 'Active and Inactive',
        description: 'Activate and deactivate student status',
      },
    }
  );
  console.log('Updated student_status_change to Active and Inactive');

  // 3. Mark student_archive as legacy alias
  await Permission.updateOne(
    { code: 'student_archive' },
    {
      $set: {
        name: 'Archive Students (Legacy)',
        description: 'Alias for student_status_change',
      },
    }
  );
  console.log('Updated student_archive to legacy alias');

  // 4. Ensure roles holding student_archive or student_manage also have student_status_change
  const roles = await Role.find({});
  for (const role of roles) {
    const perms = Array.isArray(role.permissions) ? [...role.permissions] : [];
    let updated = false;

    if ((perms.includes('student_archive') || perms.includes('student_manage') || perms.includes('*')) && !perms.includes('student_status_change')) {
      perms.push('student_status_change');
      updated = true;
    }
    if ((perms.includes('student_manage') || perms.includes('*')) && !perms.includes('enrollment_create')) {
      perms.push('enrollment_create');
      updated = true;
    }
    if ((perms.includes('student_manage') || perms.includes('*')) && !perms.includes('student_import')) {
      perms.push('student_import');
      updated = true;
    }

    if (updated) {
      role.permissions = perms;
      await role.save();
      console.log(`Updated role ${role.code} with student permissions`);
    }
  }

  console.log('Student permissions migration complete.');
  await mongoose.disconnect();
}

migrate().catch(console.error);
