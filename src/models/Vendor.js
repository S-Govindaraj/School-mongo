const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    vendorCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: String,
    phone: String,
    email: String,
    address: String,
    taxIdentifier: String,
    category: String,
    paymentTerms: {
      type: String,
      default: 'NET30',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
      default: 'ACTIVE',
    },
    notes: String,
  },
  { timestamps: true }
);

vendorSchema.index({ schoolId: 1, vendorCode: 1 }, { unique: true });

module.exports = mongoose.model('Vendor', vendorSchema);
