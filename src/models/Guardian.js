const mongoose = require('mongoose');

const guardianSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    relationship: { type: String, enum: ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'], required: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: '' },
    occupation: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    isPrimary: { type: Boolean, default: false },
    isEmergencyContact: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

guardianSchema.index({ schoolId: 1, phone: 1 });

module.exports = mongoose.model('Guardian', guardianSchema);
