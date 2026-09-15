const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    alternatePhone: { type: String, trim: true },
    licenseNumber: { type: String, required: true, trim: true, uppercase: true },
    licenseType: { type: String, default: 'HEAVY_VEHICLE' },
    licenseExpiryDate: { type: Date, required: true },
    joiningDate: { type: Date },
    address: { type: String, trim: true },
    emergencyContact: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT'], default: 'ACTIVE' },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

driverSchema.index({ schoolId: 1, licenseNumber: 1 }, { unique: true });
driverSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Driver', driverSchema);
