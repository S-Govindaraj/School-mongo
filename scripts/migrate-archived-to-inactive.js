const dns = require('dns');
dns.setServers(['8.8.8.8']);
const mongoose = require('mongoose');
require('dotenv').config();

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas successfully.');

    const collections = await mongoose.connection.db.listCollections().toArray();
    let totalUpdated = 0;

    for (const col of collections) {
      const res = await mongoose.connection.db.collection(col.name).updateMany(
        { status: 'ARCHIVED' },
        { $set: { status: 'INACTIVE', updatedAt: new Date() } }
      );
      if (res.modifiedCount > 0) {
        console.log(`Updated ${res.modifiedCount} records in '${col.name}' from ARCHIVED to INACTIVE`);
        totalUpdated += res.modifiedCount;
      }
    }

    console.log(`\nMigration completed successfully! Total records migrated: ${totalUpdated}`);
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

migrate();
