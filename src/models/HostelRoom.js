const mongoose = require('mongoose');

const hostelRoomSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    hostelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hostel',
      required: true,
      index: true,
    },
    blockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HostelBlock',
      index: true,
    },
    roomNumber: {
      type: String,
      required: true,
      trim: true,
    },
    floor: {
      type: Number,
      default: 1,
    },
    capacity: {
      type: Number,
      required: true,
      default: 2,
    },
    roomType: {
      type: String,
      enum: ['STANDARD', 'PREMIUM', 'DORMITORY', 'SPECIAL'],
      default: 'STANDARD',
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'MAINTENANCE', 'FULL', 'INACTIVE'],
      default: 'AVAILABLE',
    },
  },
  { timestamps: true }
);

hostelRoomSchema.index({ schoolId: 1, hostelId: 1, roomNumber: 1 }, { unique: true });

module.exports = mongoose.model('HostelRoom', hostelRoomSchema);
