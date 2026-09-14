const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    avatar: { type: String, default: null },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED'], default: 'ACTIVE' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
