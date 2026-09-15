const mongoose = require('mongoose');

const disciplineIncidentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    category: {
      type: String,
      default: 'BEHAVIORAL',
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
    },
    witnesses: [String],
    status: {
      type: String,
      enum: ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
  },
  { timestamps: true }
);

disciplineIncidentSchema.index({ schoolId: 1, studentId: 1, date: 1 });
disciplineIncidentSchema.index({ schoolId: 1, severity: 1, status: 1 });

module.exports = mongoose.model('DisciplineIncident', disciplineIncidentSchema);
