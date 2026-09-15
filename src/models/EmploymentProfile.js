const mongoose = require('mongoose');

const employmentProfileSchema = new mongoose.Schema(
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
    employeeNumber: {
      type: String,
      required: true,
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
    },
    designationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeCategory',
      index: true,
    },
    joiningDate: {
      type: Date,
      required: true,
    },
    confirmationDate: {
      type: Date,
    },
    employmentType: {
      type: String,
      enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERN', 'CONSULTANT'],
      default: 'FULL_TIME',
    },
    workLocation: {
      type: String,
      default: 'Main Campus',
    },
    reportingManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
    },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED', 'INACTIVE'],
      default: 'ACTIVE',
    },
    probationEndDate: Date,
    resignationDate: Date,
    lastWorkingDate: Date,
    remarks: String,
  },
  { timestamps: true }
);

employmentProfileSchema.index({ schoolId: 1, employeeNumber: 1 }, { unique: true });
employmentProfileSchema.index({ schoolId: 1, staffId: 1 }, { unique: true });
employmentProfileSchema.index({ schoolId: 1, departmentId: 1 });
employmentProfileSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('EmploymentProfile', employmentProfileSchema);
