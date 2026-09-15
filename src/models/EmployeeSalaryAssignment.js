const mongoose = require('mongoose');

const employeeSalaryAssignmentSchema = new mongoose.Schema(
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
    salaryStructureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryStructure',
      required: true,
    },
    baseSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveTo: Date,
    version: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

employeeSalaryAssignmentSchema.index({ schoolId: 1, staffId: 1, status: 1 });

module.exports = mongoose.model('EmployeeSalaryAssignment', employeeSalaryAssignmentSchema);
