const mongoose = require('mongoose');

const transportAttendanceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportAssignment', required: true },
    tripType: { type: String, enum: ['PICKUP', 'DROP'], required: true },
    status: { type: String, enum: ['BOARDED', 'ABSENT', 'MISSED', 'NOT_APPLICABLE'], default: 'BOARDED' },
    markedAt: { type: Date, default: Date.now },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, trim: true },
  },
  { timestamps: true }
);

transportAttendanceSchema.index({ schoolId: 1, date: 1, routeId: 1, tripType: 1, studentId: 1 }, { unique: true });
transportAttendanceSchema.index({ schoolId: 1, studentId: 1, date: 1 });

module.exports = mongoose.model('TransportAttendance', transportAttendanceSchema);
