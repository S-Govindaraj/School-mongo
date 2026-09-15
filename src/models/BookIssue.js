const mongoose = require('mongoose');

const bookIssueSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Library', required: true },
    bookCopyId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookCopy', required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryMember', required: true },
    issueDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date },
    status: { type: String, enum: ['ISSUED', 'RETURNED', 'OVERDUE', 'LOST', 'CANCELLED'], default: 'ISSUED' },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fineAmount: { type: Number, default: 0 },
    finePaidStatus: { type: String, enum: ['PENDING', 'PAID', 'WAIVED'], default: 'PENDING' },
    remarks: { type: String, trim: true },
  },
  { timestamps: true }
);

bookIssueSchema.index({ schoolId: 1, bookCopyId: 1, status: 1 });
bookIssueSchema.index({ schoolId: 1, memberId: 1, status: 1 });

module.exports = mongoose.model('BookIssue', bookIssueSchema);
