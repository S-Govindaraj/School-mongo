const mongoose = require('mongoose');

const feeCategorySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, trim: true, default: '' },
    categoryType: {
      type: String,
      enum: ['TUITION', 'ACADEMIC', 'TRANSPORT', 'HOSTEL', 'EXAM', 'ACTIVITY', 'LIBRARY', 'LAB', 'ADMISSION', 'ANNUAL', 'OTHER'],
      default: 'TUITION'
    },
    sequence: { type: Number, default: 1 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

feeCategorySchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('FeeCategory', feeCategorySchema);
