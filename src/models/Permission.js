const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema(
  {
    module: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Permission', permissionSchema);
