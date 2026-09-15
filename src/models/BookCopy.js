const mongoose = require('mongoose');

const bookCopySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Library', required: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    accessionNumber: { type: String, required: true, trim: true, uppercase: true },
    barcode: { type: String, required: true, trim: true, uppercase: true },
    condition: { type: String, enum: ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'], default: 'GOOD' },
    purchaseDate: { type: Date, default: Date.now },
    purchasePrice: { type: Number, default: 0 },
    currentLocation: { type: String, trim: true },
    status: { type: String, enum: ['AVAILABLE', 'ISSUED', 'RESERVED', 'LOST', 'DAMAGED', 'MAINTENANCE', 'RETIRED'], default: 'AVAILABLE' },
  },
  { timestamps: true }
);

bookCopySchema.index({ schoolId: 1, accessionNumber: 1 }, { unique: true });
bookCopySchema.index({ schoolId: 1, barcode: 1 }, { unique: true });
bookCopySchema.index({ schoolId: 1, bookId: 1, status: 1 });

module.exports = mongoose.model('BookCopy', bookCopySchema);
