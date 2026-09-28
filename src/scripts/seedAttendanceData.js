#!/usr/bin/env node

/**
 * Seed Attendance Data Script
 * Creates sample attendance data for all three tabs:
 * 1. Mark Attendance (attendance sessions)
 * 2. Monitor Dashboard (attendance summaries)
 * 3. Audit & Corrections (attendance records)
 * 
 * Usage: node src/scripts/seedAttendanceData.js
 */

const mongoose = require('mongoose');
const path = require('path');
const dns = require('dns');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ============================================================
// CONNECTION (Using same code as db.js)
// ============================================================

async function connectDB() {
  try {
    // Set DNS servers for SRV record resolution (same as db.js)
    if (process.env.MONGODB_DNS_SERVERS) {
      const dnsServers = process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim());
      dns.setServers(dnsServers);
      console.log('📡 Custom DNS servers configured');
    } else {
      try {
        dns.setServers(['8.8.8.8', '8.8.4.4']);
        console.log('📡 Using Google DNS servers');
      } catch (err) {
        console.log('⚠️  Using default DNS');
      }
    }

    // Connect with same options as db.js
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: process.env.NODE_ENV !== 'production',
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 20,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host} (DB: ${conn.connection.name})`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.error('📍 Connection URI:', process.env.MONGODB_URI?.substring(0, 50) + '...');
    
    // Retry logic
    console.log('🔄 Retrying in 5 seconds...');
    setTimeout(() => connectDB(), 5000);
  }
}

// ============================================================
// MODELS (Define inline for seeding)
// ============================================================

const attendanceSessionSchema = new mongoose.Schema({
  schoolId: mongoose.Schema.Types.ObjectId,
  academicYearId: mongoose.Schema.Types.ObjectId,
  gradeId: mongoose.Schema.Types.ObjectId,
  sectionId: mongoose.Schema.Types.ObjectId,
  date: String, // YYYY-MM-DD
  attendanceType: { type: String, enum: ['DAILY', 'PERIOD'], default: 'DAILY' },
  periodId: mongoose.Schema.Types.ObjectId,
  totalStudents: Number,
  markedBy: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const attendanceRecordSchema = new mongoose.Schema({
  schoolId: mongoose.Schema.Types.ObjectId,
  studentId: mongoose.Schema.Types.ObjectId,
  academicYearId: mongoose.Schema.Types.ObjectId,
  gradeId: mongoose.Schema.Types.ObjectId,
  sectionId: mongoose.Schema.Types.ObjectId,
  sessionId: mongoose.Schema.Types.ObjectId,
  date: String, // YYYY-MM-DD
  statusId: mongoose.Schema.Types.ObjectId,
  remarks: String,
  correctedBy: mongoose.Schema.Types.ObjectId,
  correctionReason: String,
  previousStatus: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const attendanceSummarySchema = new mongoose.Schema({
  schoolId: mongoose.Schema.Types.ObjectId,
  academicYearId: mongoose.Schema.Types.ObjectId,
  date: String, // YYYY-MM-DD
  gradeName: String,
  sectionName: String,
  total: Number,
  present: Number,
  absent: Number,
  late: Number,
  percentage: Number,
  markedToday: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const academicYearSchema = new mongoose.Schema({
  name: String,
  startDate: Date,
  endDate: Date,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const attendanceStatusSchema = new mongoose.Schema({
  name: String,
  code: { type: String, enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE'] },
  color: String,
  requiresReason: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const AttendanceSession = mongoose.model('AttendanceSession', attendanceSessionSchema, 'attendanceSessions');
const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema, 'attendanceRecords');
const AttendanceSummary = mongoose.model('AttendanceSummary', attendanceSummarySchema, 'attendanceSummaries');
const Student = mongoose.model('Student', new mongoose.Schema({}), 'students');
const Grade = mongoose.model('Grade', new mongoose.Schema({}), 'grades');
const Section = mongoose.model('Section', new mongoose.Schema({}), 'sections');
const AcademicYear = mongoose.model('AcademicYear', new mongoose.Schema({}), 'academicYears');
const AttendanceStatus = mongoose.model('AttendanceStatus', new mongoose.Schema({}), 'attendanceStatuses');
const School = mongoose.model('School', new mongoose.Schema({}), 'schools');

// Load actual Enrollment model if exists
let Enrollment;
try {
  Enrollment = require('../models/Enrollment');
} catch (err) {
  // Fallback: create simple schema
  const enrollmentSchema = new mongoose.Schema({});
  Enrollment = mongoose.model('Enrollment', enrollmentSchema, 'enrollments');
}

// ============================================================
// DATA GENERATION FUNCTIONS
// ============================================================

async function getExistingData() {
  try {
    // Get school ID first
    const school = await School.findOne();
    if (!school) {
      console.error('❌ No school found in database');
      process.exit(1);
    }
    const schoolId = school._id;
    console.log(`✅ Using School: ${school.name || school._id}`);

    const students = await Student.find().limit(50);
    const grades = await Grade.find().limit(10);
    const sections = await Section.find().limit(10);
    const academicYears = await AcademicYear.find().limit(5);
    const statuses = await AttendanceStatus.find();

    console.log(`✅ Found ${students.length} students`);
    console.log(`✅ Found ${grades.length} grades`);
    console.log(`✅ Found ${sections.length} sections`);
    console.log(`✅ Found ${academicYears.length} academic years`);
    console.log(`✅ Found ${statuses.length} attendance statuses`);

    // Validation: we need at least basic data
    if (!students.length) {
      console.error('❌ No students found');
      process.exit(1);
    }
    
    if (!grades.length) {
      console.error('❌ No grades found');
      process.exit(1);
    }
    
    if (!sections.length) {
      console.error('❌ No sections found');
      process.exit(1);
    }

    // If no academic years, create a dummy one
    let academicYearsToUse = academicYears;
    if (!academicYears.length) {
      console.log('⚠️  No academic years found - creating default one');
      const defaultAY = new AcademicYear({
        name: '2026-2027',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2027-12-31'),
        isActive: true,
      });
      await defaultAY.save();
      academicYearsToUse = [defaultAY];
      console.log('✅ Created default academic year');
    }

    // If no statuses, create default ones
    let statusesToUse = statuses;
    if (!statuses.length) {
      console.log('⚠️  No attendance statuses found - creating default ones');
      const defaultStatuses = [
        { name: 'Present', code: 'PRESENT', color: 'emerald' },
        { name: 'Absent', code: 'ABSENT', color: 'rose' },
        { name: 'Late', code: 'LATE', color: 'amber' },
        { name: 'Excused', code: 'EXCUSED', color: 'blue' },
      ];
      const created = await AttendanceStatus.insertMany(defaultStatuses);
      statusesToUse = created;
      console.log(`✅ Created ${created.length} default attendance statuses`);
    }

    return { schoolId, students, grades, sections, academicYears: academicYearsToUse, statuses: statusesToUse };
  } catch (error) {
    console.error('❌ Error fetching existing data:', error.message);
    process.exit(1);
  }
}

function generateDates(count = 10) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

function getRandomStatus(statuses) {
  return statuses[Math.floor(Math.random() * statuses.length)];
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function seedAttendanceSessions(schoolId, students, grades, sections, academicYears, statuses) {
  console.log('\n📝 Creating Attendance Sessions (Mark Tab)...');
  
  try {
    await AttendanceSession.deleteMany({});
    
    const dates = generateDates(10);
    const sessions = [];

    for (let i = 0; i < 15; i++) {
      const grade = getRandomItem(grades);
      const section = getRandomItem(sections);
      const academicYear = getRandomItem(academicYears);
      const date = getRandomItem(dates);
      
      const studentCount = Math.floor(Math.random() * 20) + 15;

      sessions.push({
        schoolId,
        academicYearId: academicYear._id,
        gradeId: grade._id,
        sectionId: section._id,
        date,
        attendanceType: Math.random() > 0.7 ? 'PERIOD' : 'DAILY',
        totalStudents: studentCount,
        markedBy: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const created = await AttendanceSession.insertMany(sessions);
    console.log(`✅ Created ${created.length} attendance sessions`);
    return created;
  } catch (error) {
    console.error('❌ Error seeding attendance sessions:', error.message);
  }
}

async function seedAttendanceRecords(schoolId, sessions, students, grades, sections, academicYears, statuses) {
  console.log('\n📝 Creating Attendance Records (Audit Tab)...');
  
  try {
    await AttendanceRecord.deleteMany({});
    
    if (!sessions || sessions.length === 0) {
      console.log('⚠️  No sessions found, skipping attendance records');
      return [];
    }
    
    // Get enrollments for the students
    const enrollments = await Enrollment.find({ schoolId }).lean();
    
    if (!enrollments || enrollments.length === 0) {
      console.log('⚠️  No enrollments found, creating placeholder records with random ObjectIds');
      // Create without real enrollments
      const records = [];
      const dates = generateDates(10);
      
      for (let i = 0; i < Math.min(50, students.length * 5); i++) {
        const session = getRandomItem(sessions);
        const student = getRandomItem(students);
        const status = getRandomStatus(statuses);
        const sessionDate = session.date instanceof Date ? session.date : new Date(getRandomItem(dates));

        records.push({
          schoolId,
          attendanceSessionId: session._id,
          studentId: student._id,
          enrollmentId: new mongoose.Types.ObjectId(), // Generate random enrollment ID
          academicYearId: session.academicYearId,
          gradeId: session.gradeId,
          sectionId: session.sectionId,
          date: sessionDate,
          periodId: session.periodId || null,
          statusId: status._id,
          markedBy: new mongoose.Types.ObjectId(),
          markedAt: new Date(),
          remarks: ['On time', 'Late due to traffic', 'Doctor appointment', 'Family emergency', ''][Math.floor(Math.random() * 5)] || '',
          source: 'BULK',
        });
      }

      const created = await AttendanceRecord.insertMany(records, { ordered: false }).catch(err => {
        if (err.code === 11000) {
          console.log('⚠️  Some duplicate records skipped');
          return err.insertedDocs || [];
        }
        throw err;
      });
      
      console.log(`✅ Created ${created.length} attendance records (with placeholder enrollmentIds)`);
      return created;
    }
    
    const records = [];
    const dates = generateDates(10);

    // Create records for random students in random sessions
    for (let i = 0; i < 100; i++) {
      const session = getRandomItem(sessions);
      const student = getRandomItem(students);
      const enrollment = getRandomItem(enrollments);
      const status = getRandomStatus(statuses);
      
      // Use session date if available
      const sessionDate = session.date instanceof Date ? session.date : new Date(getRandomItem(dates));

      records.push({
        schoolId,
        attendanceSessionId: session._id,
        studentId: student._id,
        enrollmentId: enrollment._id,
        academicYearId: session.academicYearId,
        gradeId: session.gradeId,
        sectionId: session.sectionId,
        date: sessionDate,
        periodId: session.periodId || null,
        statusId: status._id,
        markedBy: new mongoose.Types.ObjectId(),
        markedAt: new Date(),
        remarks: ['On time', 'Late due to traffic', 'Doctor appointment', 'Family emergency', ''][Math.floor(Math.random() * 5)] || '',
        source: 'BULK',
      });
    }

    const created = await AttendanceRecord.insertMany(records, { ordered: false }).catch(err => {
      // Ignore duplicate errors and return what was created
      if (err.code === 11000) {
        console.log('⚠️  Some duplicate records skipped (expected behavior)');
        return err.insertedDocs || [];
      }
      throw err;
    });
    
    console.log(`✅ Created ${created.length} attendance records`);
    return created;
  } catch (error) {
    console.error('❌ Error seeding attendance records:', error.message);
    return [];
  }
}

async function seedAttendanceSummaries(schoolId, grades, sections, academicYears) {
  console.log('\n📝 Creating Attendance Summaries (Monitor Tab)...');
  
  try {
    await AttendanceSummary.deleteMany({});
    
    const summaries = [];
    const dates = generateDates(5);

    // Create summaries for each grade-section combination
    for (let i = 0; i < 20; i++) {
      const grade = getRandomItem(grades);
      const section = getRandomItem(sections);
      const academicYear = getRandomItem(academicYears);
      const date = getRandomItem(dates);
      const total = Math.floor(Math.random() * 20) + 15;
      const present = Math.floor(total * (Math.random() * 0.3 + 0.6)); // 60-90% present
      const absent = Math.floor(total * (Math.random() * 0.2 + 0.05)); // 5-25% absent
      const late = total - present - absent;

      summaries.push({
        schoolId,
        academicYearId: academicYear._id,
        date,
        gradeName: grade.name || `Grade ${i % 12 + 1}`,
        sectionName: section.name || `Section ${String.fromCharCode(65 + (i % 26))}`,
        total,
        present,
        absent,
        late,
        percentage: Math.round((present / total) * 100),
        markedToday: Math.floor(Math.random() * total),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const created = await AttendanceSummary.insertMany(summaries);
    console.log(`✅ Created ${created.length} attendance summaries`);
    return created;
  } catch (error) {
    console.error('❌ Error seeding attendance summaries:', error.message);
  }
}

// ============================================================
// MAIN SEEDING FUNCTION
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   ATTENDANCE DATA SEEDING SCRIPT                  ║');
  console.log('║   Creates data for all 3 tabs with mixed data     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  let connected = false;
  let retries = 0;
  const maxRetries = 3;

  try {
    // Try to connect with retries
    while (!connected && retries < maxRetries) {
      console.log(`🔗 Attempting connection (Attempt ${retries + 1}/${maxRetries})...`);
      
      try {
        await connectDB();
        
        // Wait a bit for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 1000));
        connected = true;
        console.log('✅ Connection established\n');
      } catch (err) {
        retries++;
        if (retries < maxRetries) {
          console.log(`⏳ Connection attempt ${retries} failed, retrying in 3 seconds...\n`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    if (!connected) {
      console.error('\n❌ Failed to connect to MongoDB after 3 attempts');
      console.error('💡 Please ensure:');
      console.error('   1. MongoDB is running');
      console.error('   2. MONGODB_URI in .env is correct');
      console.error('   3. Network connection is stable');
      console.error('   4. MongoDB Atlas IP whitelist includes your IP');
      process.exit(1);
    }

    // Get existing data
    console.log('\n🔍 Fetching existing data...');
    const { schoolId, students, grades, sections, academicYears, statuses } = await getExistingData();

    // Seed data for all three tabs
    console.log('\n🌱 Seeding attendance data for all tabs...');
    
    const sessions = await seedAttendanceSessions(schoolId, students, grades, sections, academicYears, statuses);
    const records = await seedAttendanceRecords(schoolId, sessions, students, grades, sections, academicYears, statuses);
    const summaries = await seedAttendanceSummaries(schoolId, grades, sections, academicYears);

    // Summary
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║                  SEEDING COMPLETE ✅               ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║ Attendance Sessions (Mark Tab): ${sessions?.length || 0} created`);
    console.log(`║ Attendance Records (Audit Tab): ${records?.length || 0} created`);
    console.log(`║ Attendance Summaries (Monitor): ${summaries?.length || 0} created`);
    console.log('╠════════════════════════════════════════════════════╣');
    console.log('║ Data is now available in the three tabs:          ║');
    console.log('║ 1. Mark Attendance - Select & mark students       ║');
    console.log('║ 2. Monitor Dashboard - View summaries             ║');
    console.log('║ 3. Audit & Corrections - Review records           ║');
    console.log('║                                                  ║');
    console.log('║ Next: Hard refresh (Ctrl+F5) then navigate to:  ║');
    console.log('║ Academic Operations → Attendance Tab             ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during seeding:', error.message);
    console.error('📍 Stack:', error.stack);
    process.exit(1);
  }
}

// Run the seeding script
main();
