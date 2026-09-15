const mongoose = require('mongoose');

const transportAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
    routeStopId: { type: mongoose.Schema.Types.ObjectId, ref: 'RouteStop', required: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    pickupRequired: { type: Boolean, default: true },
    dropRequired: { type: Boolean, default: true },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'CANCELLED'], default: 'ACTIVE' },
    remarks: { type: String, trim: true },
  },
  { timestamps: true }
);

transportAssignmentSchema.index({ schoolId: 1, academicYearId: 1, studentId: 1, status: 1 });
transportAssignmentSchema.index({ schoolId: 1, routeId: 1, status: 1 });

module.exports = mongoose.model('TransportAssignment', transportAssignmentSchema);
