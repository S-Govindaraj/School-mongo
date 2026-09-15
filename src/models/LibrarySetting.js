const mongoose = require('mongoose');

const librarySettingSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    maximumBooks: { type: Number, default: 5 },
    defaultLoanPeriodDays: { type: Number, default: 14 },
    studentLoanPeriodDays: { type: Number, default: 14 },
    staffLoanPeriodDays: { type: Number, default: 30 },
    finePerDay: { type: Number, default: 5 },
    maximumFine: { type: Number, default: 500 },
    gracePeriodDays: { type: Number, default: 2 },
    renewalLimit: { type: Number, default: 2 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LibrarySetting', librarySettingSchema);
