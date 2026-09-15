const mongoose = require('mongoose');

const bookCategorySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

bookCategorySchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('BookCategory', bookCategorySchema);
