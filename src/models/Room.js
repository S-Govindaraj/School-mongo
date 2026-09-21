const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus' },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    capacity: { type: Number, required: true, min: 1, default: 30 },
    isLab: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
  },
  { timestamps: true }
);

roomSchema.pre('validate', function (next) {
  if (this.name) this.name = String(this.name).trim();
  next();
});

roomSchema.index({ schoolId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Room', roomSchema);
