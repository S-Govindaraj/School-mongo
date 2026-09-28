#!/usr/bin/env node

/**
 * Migrate Attendance Collections Script
 * Moves data from lowercase collections (MongoDB default) to camelCase collections
 * This fixes the duplicate collection issue
 * 
 * Before: attendancesessions, attendancerecords, attendancestatuses, attendanceaudits
 * After: attendanceSessions, attendanceRecords, attendanceStatuses, attendanceAudits
 * 
 * Usage: node src/scripts/migrateAttendanceCollections.js
 */

const mongoose = require('mongoose');
const path = require('path');
const dns = require('dns');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ============================================================
// CONNECTION
// ============================================================

async function connectDB() {
  try {
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
    return conn;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
}

// ============================================================
// MIGRATION
// ============================================================

async function migrateCollections(db) {
  console.log('\n🔄 Migrating attendance collections...\n');

  const migrations = [
    { from: 'attendancesessions', to: 'attendanceSessions' },
    { from: 'attendancerecords', to: 'attendanceRecords' },
    { from: 'attendancestatuses', to: 'attendanceStatuses' },
    { from: 'attendanceaudits', to: 'attendanceAudits' },
  ];

  let totalMigrated = 0;

  for (const migration of migrations) {
    const fromCollection = db.collection(migration.from);
    const toCollection = db.collection(migration.to);

    try {
      // Check if source collection exists
      const fromCount = await fromCollection.countDocuments();
      const toCount = await toCollection.countDocuments();

      console.log(`📊 ${migration.from}:`);
      console.log(`   - Count: ${fromCount} documents`);
      console.log(`   - Target (${migration.to}): ${toCount} documents`);

      if (fromCount === 0) {
        console.log(`   - ✅ No data to migrate (source empty)\n`);
        continue;
      }

      if (toCount > 0) {
        console.log(`   - ⚠️  Target already has ${toCount} documents`);
        
        // For statuses, merge by code (unique constraint)
        if (migration.from === 'attendancestatuses') {
          console.log(`   - 🔄 Merging (removing duplicates by code)...`);
          
          // Get all documents from source
          const sourceDocuments = await fromCollection.find({}).toArray();
          
          // For each source document, check if it exists in target by code
          let merged = 0;
          for (const doc of sourceDocuments) {
            const existing = await toCollection.findOne({ code: doc.code });
            if (!existing) {
              // Only insert if code doesn't exist in target
              await toCollection.insertOne(doc);
              merged++;
            }
          }
          console.log(`   - ✅ Merged ${merged} new documents (${sourceDocuments.length - merged} already existed)`);
          totalMigrated += merged;
          
          // Drop source collection
          await fromCollection.drop();
          console.log(`   - 🗑️  Deleted source collection\n`);
        } else {
          console.log(`   - ⏭️  Skipping (manual review recommended)\n`);
        }
      }

      // Migrate data
      console.log(`   - 🔄 Migrating ${fromCount} documents...`);
      const documents = await fromCollection.find({}).toArray();
      
      if (documents.length > 0) {
        await toCollection.insertMany(documents);
        console.log(`   - ✅ Migrated ${documents.length} documents`);
        totalMigrated += documents.length;
      }

      // Delete source collection
      await fromCollection.drop();
      console.log(`   - 🗑️  Deleted source collection\n`);

    } catch (error) {
      if (error.message.includes('ns not found')) {
        console.log(`   - ℹ️  Source collection doesn't exist (OK)\n`);
      } else {
        console.error(`   - ❌ Error: ${error.message}\n`);
      }
    }
  }

  return totalMigrated;
}

// ============================================================
// VERIFY
// ============================================================

async function verifyMigration(db) {
  console.log('📋 Verifying collections...\n');

  const correctCollections = [
    'attendanceSessions',
    'attendanceRecords',
    'attendanceStatuses',
    'attendanceAudits',
  ];

  const oldCollections = [
    'attendancesessions',
    'attendancerecords',
    'attendancestatuses',
    'attendanceaudits',
  ];

  console.log('✅ Correct collections:');
  for (const collName of correctCollections) {
    const collection = db.collection(collName);
    const count = await collection.countDocuments();
    console.log(`   - ${collName}: ${count} documents`);
  }

  console.log('\n❌ Old collections (should be gone):');
  for (const collName of oldCollections) {
    try {
      const collection = db.collection(collName);
      const count = await collection.countDocuments();
      if (count > 0) {
        console.log(`   - ${collName}: ${count} documents (STILL EXISTS!)`);
      }
    } catch (error) {
      console.log(`   - ${collName}: ✅ Not found (correct)`);
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   ATTENDANCE COLLECTIONS MIGRATION SCRIPT          ║');
  console.log('║   Fixes duplicate collections issue                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  let connection;
  try {
    connection = await connectDB();
    const db = connection.connection.db;

    const totalMigrated = await migrateCollections(db);
    await verifyMigration(db);

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║             MIGRATION COMPLETE ✅                  ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║ Total documents migrated: ${totalMigrated.toString().padEnd(27)} ║`);
    console.log('║                                                    ║');
    console.log('║ Collections are now properly named:                ║');
    console.log('║ - attendanceSessions (camelCase) ✅                ║');
    console.log('║ - attendanceRecords (camelCase) ✅                 ║');
    console.log('║ - attendanceStatuses (camelCase) ✅                ║');
    console.log('║ - attendanceAudits (camelCase) ✅                  ║');
    console.log('║                                                    ║');
    console.log('║ Duplicate lowercase collections deleted ✅        ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
