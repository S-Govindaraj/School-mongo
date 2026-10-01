const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Permission = mongoose.connection.collection('permissions');
  const perms = await Permission.find({
    code: { $regex: '^(academic_config|academic_year|academic_term|grade|section|subject|class_subject|teacher_assignment)' }
  }).toArray();
  
  console.log(JSON.stringify(perms.map(p => ({
    code: p.code,
    name: p.name,
    description: p.description
  })), null, 2));
  
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
