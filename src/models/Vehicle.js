const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus' },
    vehicleNumber: { type: String, required: true, trim: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    vehicleType: { type: String, enum: ['BUS', 'VAN', 'MINIBUS', 'CAB', 'OTHER'], default: 'BUS' },
    make: { type: String, trim: true },
    model: { type: String, trim: true },
    capacity: { type: Number, required: true, min: 1 },
    manufactureYear: { type: Number },
    insuranceNumber: { type: String, trim: true },
    insuranceExpiryDate: { type: Date },
    permitNumber: { type: String, trim: true },
    permitExpiryDate: { type: Date },
    fitnessCertificateNumber: { type: String, trim: true },
    fitnessExpiryDate: { type: Date },
    pollutionCertificateNumber: { type: String, trim: true },
    pollutionExpiryDate: { type: Date },
    gpsDeviceId: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'], default: 'ACTIVE' },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

vehicleSchema.index({ schoolId: 1, registrationNumber: 1 }, { unique: true });
vehicleSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);
