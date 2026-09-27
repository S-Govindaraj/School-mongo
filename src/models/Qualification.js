const mongoose = require('mongoose');

const qualificationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    code: { type: String, trim: true, uppercase: true, default: '' },
    name: { type: String, required: true, trim: true },
    level: {
      type: String,
      enum: ['DOCTORATE', 'POST_GRADUATE', 'UNDER_GRADUATE', 'DIPLOMA', 'CERTIFICATE', 'SPECIALIZATION', 'PROFESSIONAL', 'OTHER'],
      default: 'POST_GRADUATE',
    },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

qualificationSchema.index({ schoolId: 1, name: 1 });

module.exports = mongoose.model('Qualification', qualificationSchema);
