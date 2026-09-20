const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
    capacity: { type: Number, required: true, min: 1, default: 40 },
    room: { type: String, default: '', trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
  },
  { timestamps: true }
);

sectionSchema.pre('validate', function (next) {
  if (this.name) this.name = String(this.name).trim();
  if (this.code) this.code = String(this.code).trim().toUpperCase();
  next();
});

sectionSchema.index({ schoolId: 1, gradeId: 1, code: 1 }, { unique: true });
sectionSchema.index({ schoolId: 1, gradeId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Section', sectionSchema);
