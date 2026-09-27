const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('dotenv').config();

const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const schoolId = '6aa92206207b18c94eb2d0ca';

  const enrollments = await Enrollment.find({ schoolId }).populate('studentId', 'studentNumber');
  console.log(`Found ${enrollments.length} enrollments`);

  for (let i = 0; i < enrollments.length; i++) {
    const enr = enrollments[i];
    if (!enr.enrollmentNumber) {
      const stuNum = enr.studentId?.studentNumber;
      const numPart = stuNum ? stuNum.replace('STU-', '') : String(i + 1).padStart(5, '0');
      enr.enrollmentNumber = `ENR-${numPart}`;
      await enr.save();
      console.log(`Updated enrollment ${enr._id} with enrollmentNumber ${enr.enrollmentNumber}`);
    } else {
      console.log(`Enrollment ${enr._id} already has ${enr.enrollmentNumber}`);
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
