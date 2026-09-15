const mongoose = require('mongoose');

const disciplinaryActionSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DisciplineIncident',
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      enum: ['WARNING', 'COUNSELLING', 'PARENT_MEETING', 'DETENTION', 'SUSPENSION', 'OTHER'],
      required: true,
    },
    actionDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    duration: String,
    reason: String,
    notes: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'COMPLETED',
    },
  },
  { timestamps: true }
);

disciplinaryActionSchema.index({ schoolId: 1, incidentId: 1 });

module.exports = mongoose.model('DisciplinaryAction', disciplinaryActionSchema);
