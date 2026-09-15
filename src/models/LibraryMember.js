const mongoose = require('mongoose');

const libraryMemberSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    memberType: { type: String, enum: ['STUDENT', 'STAFF'], required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    membershipNumber: { type: String, required: true, trim: true, uppercase: true },
    issueLimit: { type: Number, default: 3 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date },
  },
  { timestamps: true }
);

libraryMemberSchema.index({ schoolId: 1, membershipNumber: 1 }, { unique: true });
libraryMemberSchema.index({ schoolId: 1, studentId: 1 });
libraryMemberSchema.index({ schoolId: 1, staffId: 1 });

module.exports = mongoose.model('LibraryMember', libraryMemberSchema);
