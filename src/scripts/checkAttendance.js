const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const schoolId = '6aa92206207b18c94eb2d0ca';
  const student = await mongoose.connection.db.collection('students').findOne({ schoolId: new mongoose.Types.ObjectId(schoolId), studentNumber: 'STU-2026-00001' });
  console.log('STUDENT:', student ? { _id: student._id, name: student.firstName + ' ' + student.lastName } : null);

  const enrollment = await mongoose.connection.db.collection('enrollments').findOne({ schoolId: new mongoose.Types.ObjectId(schoolId), studentId: student._id, isCurrent: true });
  console.log('ENROLLMENT:', enrollment);

  const sessions = await mongoose.connection.db.collection('attendancesessions').find({
    schoolId: new mongoose.Types.ObjectId(schoolId),
    sectionId: enrollment.sectionId
  }).toArray();
  console.log('SESSIONS FOR STUDENT SECTION:', sessions.length, sessions.map(s => ({ _id: s._id, date: s.date, status: s.status })));

  const allStatuses = await mongoose.connection.db.collection('attendancestatuses').find({
    schoolId: new mongoose.Types.ObjectId(schoolId)
  }).toArray();
  console.log('STATUSES:', allStatuses.map(s => ({ _id: s._id, name: s.name, code: s.code, countsAsPresent: s.countsAsPresent })));

  await mongoose.disconnect();
}
test().catch(console.error);
