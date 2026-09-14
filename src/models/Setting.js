const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    category: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    value: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

settingSchema.index({ schoolId: 1, category: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Setting', settingSchema);

