/**
 * Delete ALL Attendance Collections and Data
 * ==========================================
 * 
 * This script:
 * 1. Deletes camelCase collections (correct names):
 *    - attendanceSessions
 *    - attendanceRecords
 *    - attendanceStatuses
 *    - attendanceAudits
 * 
 * 2. Deletes lowercase duplicate collections (if they exist):
 *    - attendancesessions
 *    - attendancerecords
 *    - attendancestatuses
 *    - attendanceaudits
 * 
 * Result: Database is completely clean of attendance data
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function deleteAllAttendanceData() {
  let connection = null;
  
  try {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   DELETE ALL ATTENDANCE DATA & DUPLICATE COLLECTIONS║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });
    
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.getClient().db();
    
    // Collections to delete (camelCase - correct)
    const correctCollections = [
      'attendanceSessions',
      'attendanceRecords',
      'attendanceStatuses',
      'attendanceAudits',
    ];
    
    // Collections to delete (lowercase - duplicates)
    const duplicateCollections = [
      'attendancesessions',
      'attendancerecords',
      'attendancestatuses',
      'attendanceaudits',
    ];
    
    const allCollections = [...correctCollections, ...duplicateCollections];
    
    console.log('📋 Collections to delete:');
    console.log('   Correct (camelCase):', correctCollections.join(', '));
    console.log('   Duplicates (lowercase):', duplicateCollections.join(', '));
    console.log('');
    
    // Get list of existing collections
    const existingCollections = await db.listCollections().toArray();
    const existingCollectionNames = existingCollections.map(c => c.name);
    
    console.log('🔍 Checking existing collections:\n');
    
    let deletedCount = 0;
    let deletedDocuments = 0;
    
    for (const collection of allCollections) {
      if (existingCollectionNames.includes(collection)) {
        try {
          // Get document count before deletion
          const count = await db.collection(collection).countDocuments();
          
          // Drop the collection
          await db.collection(collection).drop();
          
          console.log(`✅ Deleted collection: "${collection}" (${count} documents)`);
          deletedCount++;
          deletedDocuments += count;
        } catch (err) {
          if (err.code === 26) {
            // namespace does not exist error - collection already deleted
            console.log(`⚠️  Collection "${collection}" doesn't exist (may have been deleted)`);
          } else {
            console.log(`❌ Error deleting "${collection}":`, err.message);
          }
        }
      } else {
        console.log(`⚪ Collection "${collection}" not found (doesn't exist)`);
      }
    }
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║                    CLEANUP COMPLETE                 ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    console.log(`✅ Collections deleted: ${deletedCount}`);
    console.log(`✅ Total documents deleted: ${deletedDocuments}\n`);
    console.log('✅ Database is now clean of all attendance data');
    console.log('✅ No duplicate collections remain\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
      console.error('💡 Hint: Check if MongoDB Atlas is accessible');
      console.error('💡 Hint: Check if your IP is whitelisted in MongoDB Atlas security settings');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

// Run the script
deleteAllAttendanceData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
