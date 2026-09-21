const mongoose = require('mongoose');

/**
 * Runs `operation(session)` inside a Mongo transaction when the deployment
 * supports one (replica set/mongos), falling back to running it without a
 * session on standalone Mongo (e.g. local dev). Extracted from
 * academicYearController.js so every multi-write operation (year rollover,
 * timetable generation save, etc.) shares one transaction strategy.
 */
const withTransactionOrFallback = async (operation) => {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (_) { }
    }
    // If running in standalone Mongo (e.g., local dev without replica set)
    if (err.message && err.message.includes('replica set member or mongos')) {
      return await operation(null);
    }
    throw err;
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (_) { }
    }
  }
};

module.exports = { withTransactionOrFallback };
