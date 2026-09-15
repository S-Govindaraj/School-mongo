const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  campusId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campus'
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    default: ''
  },
  announcementType: {
    type: String,
    enum: ['GENERAL', 'ACADEMIC', 'EXAM', 'ATTENDANCE', 'FEE', 'EVENT', 'URGENT', 'HOLIDAY', 'NOTICE'],
    default: 'GENERAL'
  },
  priority: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
    default: 'NORMAL'
  },
  audienceType: {
    type: String,
    enum: ['SCHOOL', 'CAMPUS', 'GRADE', 'SECTION', 'STUDENT', 'STAFF', 'ROLE', 'CUSTOM_AUDIENCE'],
    default: 'SCHOOL'
  },
  targetGradeIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Grade'
  }],
  targetSectionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Section'
  }],
  targetStudentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }],
  targetStaffIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  }],
  targetRoleIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],
  publishAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'CANCELLED'],
    default: 'DRAFT'
  },
  attachments: [{
    title: String,
    fileUrl: String,
    fileType: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  publishedAt: {
    type: Date
  }
}, { timestamps: true });

announcementSchema.index({ schoolId: 1, status: 1, publishAt: 1 });
announcementSchema.index({ schoolId: 1, expiresAt: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
