const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
    category: { type: String, default: 'Primary', trim: true },
    sequenceOrder: { type: Number, required: true, min: 0, default: 1 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
  },
  { timestamps: true }
);

gradeSchema.pre('validate', function (next) {
  if (this.name) this.name = String(this.name).trim();
  if (this.code) this.code = String(this.code).trim().toUpperCase();
  next();
});

gradeSchema.index({ schoolId: 1, code: 1 }, { unique: true });
gradeSchema.index({ schoolId: 1, sequenceOrder: 1 }, { unique: true });

module.exports = mongoose.model('Grade', gradeSchema);
