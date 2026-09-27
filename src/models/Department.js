const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    headStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

departmentSchema.index({ schoolId: 1, code: 1 }, { unique: true });
departmentSchema.index({ schoolId: 1, name: 1 });

module.exports = mongoose.model('Department', departmentSchema);
