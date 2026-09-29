const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    code: { type: String, trim: true, uppercase: true, default: '' },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

designationSchema.index({ schoolId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Designation', designationSchema);
