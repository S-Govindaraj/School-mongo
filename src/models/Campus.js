const mongoose = require('mongoose');

const campusSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    isMain: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

campusSchema.index({ schoolId: 1, code: 1 }, { unique: true });
campusSchema.index({ schoolId: 1, isMain: 1 });

module.exports = mongoose.model('Campus', campusSchema);

