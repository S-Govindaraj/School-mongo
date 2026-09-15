const mongoose = require('mongoose');

const visitorAppointmentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    visitorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Visitor',
    },
    visitorName: String,
    visitorPhone: String,
    appointmentDate: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    purpose: String,
    hostStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
    },
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'],
      default: 'REQUESTED',
    },
  },
  { timestamps: true }
);

visitorAppointmentSchema.index({ schoolId: 1, appointmentDate: 1 });

module.exports = mongoose.model('VisitorAppointment', visitorAppointmentSchema);
