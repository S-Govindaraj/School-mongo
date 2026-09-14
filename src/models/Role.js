const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true, default: '' },
    hierarchyLevel: { type: Number, required: true, default: 5 },
    isSystem: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    permissions: [{ type: String }], // Array of permission codes, e.g. ['school.manage', 'staff.manage']
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', roleSchema);
