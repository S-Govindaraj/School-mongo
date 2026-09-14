const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employeeId: { type: String, required: true, unique: true, trim: true },
    designation: { type: String, required: true, trim: true },
    department: { type: String, trim: true, default: '' },
    joiningDate: { type: Date, default: Date.now },
    qualification: { type: String, default: '' },
    experienceYears: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Staff', staffSchema);
