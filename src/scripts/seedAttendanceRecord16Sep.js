const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('dotenv').config();

const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceStatus = require('../models/AttendanceStatus');

async function seedAttendance() {
  await mongoose.connect(process.env.MONGODB_URI);
  const schoolId = '6aa92206207b18c94eb2d0ca';
  const student = await Student.findOne({ schoolId, studentNumber: 'STU-2026-00001' });
  if (!student) {
    console.error('Student STU-2026-00001 not found');
    process.exit(1);
  }

  const enrollment = await Enrollment.findOne({ schoolId, studentId: student._id, isCurrent: true });
  if (!enrollment) {
    console.error('Enrollment not found for student');
    process.exit(1);
  }

  const presentStatus = await AttendanceStatus.findOne({ schoolId, code: 'PRESENT' })
    || await AttendanceStatus.findOne({ schoolId, countsAsPresent: true });

  if (!presentStatus) {
    console.error('PRESENT AttendanceStatus not found');
    process.exit(1);
  }

  const attendanceDate = new Date('2026-09-16T00:00:00.000Z');

  // Upsert AttendanceSession
  let session = await AttendanceSession.findOne({
    schoolId,
    sectionId: enrollment.sectionId,
    date: attendanceDate,
    attendanceType: 'DAILY',
  });

  if (!session) {
    session = await AttendanceSession.create({
      schoolId,
      academicYearId: enrollment.academicYearId,
      date: attendanceDate,
      gradeId: enrollment.gradeId,
      sectionId: enrollment.sectionId,
      attendanceType: 'DAILY',
      status: 'SUBMITTED',
      startedAt: attendanceDate,
      completedAt: attendanceDate,
    });
    console.log('Created AttendanceSession:', session._id);
  } else {
    console.log('Found existing AttendanceSession:', session._id);
  }

  // Upsert AttendanceRecord
  const record = await AttendanceRecord.findOneAndUpdate(
    {
      schoolId,
      attendanceSessionId: session._id,
      studentId: student._id,
    },
    {
      $set: {
        academicYearId: enrollment.academicYearId,
        enrollmentId: enrollment._id,
        gradeId: enrollment.gradeId,
        sectionId: enrollment.sectionId,
        date: attendanceDate,
        statusId: presentStatus._id,
        markedAt: attendanceDate,
        remarks: 'Present in class',
        source: 'MANUAL',
      },
    },
    { upsert: true, new: true }
  );

  console.log('AttendanceRecord for 16 September 2026 marked PRESENT:', record);

  await mongoose.disconnect();
}

seedAttendance().catch(console.error);
