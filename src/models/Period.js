const mongoose = require('mongoose');

const periodSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    sequence: { type: Number, required: true, min: 1 },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, default: 45 },
    // `type` is the source of truth for period classification (instructional vs
    // non-instructional). `isBreak` is kept in sync automatically for every
    // existing consumer that still reads it (attendance, timetable generator
    // capacity math, etc.) — never set isBreak directly, set `type` instead.
    type: { type: String, enum: ['INSTRUCTIONAL', 'BREAK', 'LUNCH'], default: 'INSTRUCTIONAL' },
    isBreak: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'INACTIVE' },
  },
  { timestamps: true }
);

periodSchema.pre('validate', function (next) {
  if (this.name) this.name = String(this.name).trim();
  if (this.code) this.code = String(this.code).trim().toUpperCase();
  // Keep `type` and `isBreak` in sync regardless of which one the caller set —
  // `type` wins when both are present (it's the more specific classification).
  if (this.isModified('type') && this.type) {
    this.isBreak = this.type !== 'INSTRUCTIONAL';
  } else if (this.isModified('isBreak') && !this.isModified('type')) {
    this.type = this.isBreak ? 'BREAK' : 'INSTRUCTIONAL';
  } else if (this.isNew && !this.type) {
    this.type = this.isBreak ? 'BREAK' : 'INSTRUCTIONAL';
  }
  if (this.startTime && this.endTime) {
    const [startH, startM] = this.startTime.split(':').map(Number);
    const [endH, endM] = this.endTime.split(':').map(Number);
    const diff = (endH * 60 + endM) - (startH * 60 + startM);
    if (diff > 0) {
      this.durationMinutes = diff;
    }
  }
  next();
});

periodSchema.index({ schoolId: 1, code: 1 }, { unique: true });
periodSchema.index({ schoolId: 1, sequence: 1 }, { unique: true });

module.exports = mongoose.model('Period', periodSchema);
