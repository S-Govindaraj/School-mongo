const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    passNumber: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: String,
    idType: String,
    idReference: String,
    photoUrl: String,
    purpose: {
      type: String,
      required: true,
    },
    hostType: {
      type: String,
      enum: ['STAFF', 'STUDENT', 'SCHOOL'],
      default: 'STAFF',
    },
    hostId: mongoose.Schema.Types.ObjectId,
    hostName: String,
    visitDate: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    expectedArrival: String,
    expectedDeparture: String,
    actualCheckIn: String,
    actualCheckOut: String,
    status: {
      type: String,
      enum: ['EXPECTED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'],
      default: 'CHECKED_IN',
      index: true,
    },
  },
  { timestamps: true }
);

visitorSchema.index({ schoolId: 1, passNumber: 1 }, { unique: true });
visitorSchema.index({ schoolId: 1, visitDate: 1, status: 1 });

module.exports = mongoose.model('Visitor', visitorSchema);
