const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    libraryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Library', required: true },
    isbn: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookCategory', required: true },
    authorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Author' }],
    publisherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Publisher' },
    edition: { type: String, trim: true },
    publicationYear: { type: Number },
    language: { type: String, default: 'English' },
    pages: { type: Number },
    description: { type: String, trim: true },
    coverImage: { type: String, trim: true },
    shelfLocation: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

bookSchema.index({ schoolId: 1, libraryId: 1, title: 1 });
bookSchema.index({ schoolId: 1, isbn: 1 });

module.exports = mongoose.model('Book', bookSchema);
