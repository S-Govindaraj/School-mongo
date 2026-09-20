const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    normalizedName: { type: String, trim: true, lowercase: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
    shortName: { type: String, default: '', trim: true },
    type: { type: String, enum: ['CORE', 'ELECTIVE', 'LANGUAGE', 'PRACTICAL', 'OTHER', 'LAB', 'ACTIVITY'], default: 'CORE' },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
  },
  { timestamps: true }
);

subjectSchema.pre('validate', function (next) {
  if (this.name) {
    this.name = String(this.name).trim();
    this.normalizedName = this.name.toLowerCase();
  }
  if (this.code) {
    this.code = String(this.code).trim().toUpperCase();
  }
  next();
});

subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });
subjectSchema.index({ schoolId: 1, normalizedName: 1 }, { unique: true });

module.exports = mongoose.model('Subject', subjectSchema);
