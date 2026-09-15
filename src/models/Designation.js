const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    level: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

designationSchema.index({ schoolId: 1, code: 1 }, { unique: true });
designationSchema.index({ schoolId: 1, departmentId: 1 });

module.exports = mongoose.model('Designation', designationSchema);
