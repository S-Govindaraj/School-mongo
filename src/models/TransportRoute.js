const mongoose = require('mongoose');

const transportRouteSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus' },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    routeCode: { type: mongoose.Schema.Types.String, required: true, trim: true, uppercase: true },
    routeName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    direction: { type: String, enum: ['PICKUP', 'DROP', 'BOTH'], default: 'BOTH' },
    estimatedDurationMinutes: { type: Number, default: 60 },
    assignedVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    assignedDriverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

transportRouteSchema.index({ schoolId: 1, routeCode: 1 }, { unique: true });
transportRouteSchema.index({ schoolId: 1, academicYearId: 1, status: 1 });

module.exports = mongoose.model('TransportRoute', transportRouteSchema);
