#!/usr/bin/env node

/**
 * Clean Attendance Data Script
 * Removes all malformed/incomplete attendance data from database
 * Then reseeds with proper data
 * 
 * Usage: node src/scripts/cleanAttendanceData.js
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
    // Set DNS servers for SRV record resolution
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

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: process.env.NODE_ENV !== 'production',
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 20,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
}

// ============================================================
// MODELS
// ============================================================

const AttendanceSession = mongoose.model('AttendanceSession', new mongoose.Schema({}), 'attendanceSessions');
const AttendanceRecord = mongoose.model('AttendanceRecord', new mongoose.Schema({}), 'attendanceRecords');
const AttendanceSummary = mongoose.model('AttendanceSummary', new mongoose.Schema({}), 'attendanceSummaries');

// ============================================================
// CLEANUP
// ============================================================

async function cleanupAttendanceData() {
  console.log('\n🧹 Cleaning up attendance data...\n');

  try {
    // Count before
    const sessionsBefore = await AttendanceSession.countDocuments();
    const recordsBefore = await AttendanceRecord.countDocuments();
    const summariesBefore = await AttendanceSummary.countDocuments();

    console.log(`📊 Before cleanup:`);
    console.log(`   - Sessions: ${sessionsBefore}`);
    console.log(`   - Records: ${recordsBefore}`);
    console.log(`   - Summaries: ${summariesBefore}`);

    // Delete ALL attendance data (clean slate)
    const sessionsDeleted = await AttendanceSession.deleteMany({});
    const recordsDeleted = await AttendanceRecord.deleteMany({});
    const summariesDeleted = await AttendanceSummary.deleteMany({});

    console.log(`\n🗑️  Deleted:`);
    console.log(`   - Sessions: ${sessionsDeleted.deletedCount}`);
    console.log(`   - Records: ${recordsDeleted.deletedCount}`);
    console.log(`   - Summaries: ${summariesDeleted.deletedCount}`);

    // Verify clean
    const sessionsAfter = await AttendanceSession.countDocuments();
    const recordsAfter = await AttendanceRecord.countDocuments();
    const summariesAfter = await AttendanceSummary.countDocuments();

    console.log(`\n✅ After cleanup (should all be 0):`);
    console.log(`   - Sessions: ${sessionsAfter}`);
    console.log(`   - Records: ${recordsAfter}`);
    console.log(`   - Summaries: ${summariesAfter}`);

    if (sessionsAfter === 0 && recordsAfter === 0 && summariesAfter === 0) {
      console.log('\n✅ ✅ ✅ Database cleaned successfully!');
      console.log('\n📌 Next step: Run "npm run seed:attendance" to reseed clean data\n');
      return true;
    } else {
      console.log('\n❌ Cleanup failed - data still exists');
      return false;
    }
  } catch (error) {
    console.error('❌ Cleanup error:', error.message);
    return false;
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   ATTENDANCE DATA CLEANUP SCRIPT                   ║');
  console.log('║   Removes all malformed/incomplete data            ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();
    console.log('');

    const success = await cleanupAttendanceData();

    if (success) {
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log('║                CLEANUP COMPLETE ✅                 ║');
      console.log('╠════════════════════════════════════════════════════╣');
      console.log('║ All malformed attendance data removed              ║');
      console.log('║ Database is ready for fresh seeding                ║');
      console.log('║                                                    ║');
      console.log('║ Run this command next:                             ║');
      console.log('║ npm run seed:attendance                            ║');
      console.log('║                                                    ║');
      console.log('║ This will create 15 sessions, 100 records,         ║');
      console.log('║ and 20 summaries with proper data                  ║');
      console.log('╚════════════════════════════════════════════════════╝\n');
      process.exit(0);
    } else {
      console.log('\n❌ Cleanup failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
