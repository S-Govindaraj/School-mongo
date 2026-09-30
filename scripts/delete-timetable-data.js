const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore if custom DNS cannot be set
}

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Timetable = require('../src/models/Timetable');
const TimetableGeneratorDraft = require('../src/models/TimetableGeneratorDraft');

async function deleteTimetableData() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri);
    console.log(' Connected to database successfully.');

    // Count existing records before deletion
    const timetableCount = await Timetable.countDocuments();
    const draftCount = await TimetableGeneratorDraft.countDocuments();

    console.log('\n📊 Existing Timetable Data Summary:');
    console.log(` - Timetable Entries (timetables): ${timetableCount}`);
    console.log(` - Generator Drafts (timetablegeneratordrafts): ${draftCount}`);

    if (timetableCount === 0 && draftCount === 0) {
      console.log('\n✨ No timetable data found in database. Nothing to delete.');
      return;
    }

    console.log('\n🗑️  Deleting all timetable data...');

    const deletedTimetables = await Timetable.deleteMany({});
    const deletedDrafts = await TimetableGeneratorDraft.deleteMany({});

    console.log(` - Deleted ${deletedTimetables.deletedCount} timetable slot entries.`);
    console.log(` - Deleted ${deletedDrafts.deletedCount} generator draft sessions.`);

    // Verify cleanup
    const remainingTimetables = await Timetable.countDocuments();
    const remainingDrafts = await TimetableGeneratorDraft.countDocuments();

    console.log('\n Verification:');
    console.log(` - Remaining Timetable Entries: ${remainingTimetables}`);
    console.log(` - Remaining Generator Drafts: ${remainingDrafts}`);
    console.log('\n All timetable data deleted successfully!');
  } catch (err) {
    console.error('❌ Error deleting timetable data:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

deleteTimetableData();
