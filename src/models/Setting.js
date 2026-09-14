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

module.exports = mongoose.model('Setting', settingSchema);
