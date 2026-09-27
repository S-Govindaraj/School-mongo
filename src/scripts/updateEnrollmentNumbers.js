require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');

async function run() {
  await connectDB();
  const enrollments = await Enrollment.find({}).populate('studentId').lean();
  let count = 0;
  for (let i = 0; i < enrollments.length; i++) {
    const e = enrollments[i];
    if (!e.enrollmentNumber) {
      const stuNum = e.studentId?.studentNumber;
      const numPart = stuNum ? stuNum.replace('STU-', '') : String(i + 1).padStart(5, '0');
      const enrollmentNumber = `ENR-${numPart}`;
      await Enrollment.updateOne({ _id: e._id }, { $set: { enrollmentNumber } });
      count++;
    }
  }
  const sample = await Enrollment.findById('6ab773712bb7369affa5435f').lean();
  console.log(`Updated ${count} enrollments. Sample enrollmentNumber for STU-2026-00001:`, sample?.enrollmentNumber);
  await mongoose.disconnect();
}

run().catch(console.error);
