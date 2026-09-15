const mongoose = require('mongoose');

const employeeHistorySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        'JOINING',
        'PROBATION_CONFIRMATION',
        'PROMOTION',
        'TRANSFER',
        'DEPARTMENT_CHANGE',
        'DESIGNATION_CHANGE',
        'SALARY_REVISION',
        'SUSPENSION',
        'RESIGNATION',
        'TERMINATION',
        'RETIREMENT',
      ],
    },
    effectiveDate: {
      type: Date,
      default: Date.now,
    },
    oldValue: String,
    newValue: String,
    reason: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

employeeHistorySchema.index({ schoolId: 1, staffId: 1, effectiveDate: -1 });

module.exports = mongoose.model('EmployeeHistory', employeeHistorySchema);
