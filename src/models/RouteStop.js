const mongoose = require('mongoose');

const routeStopSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
    stopCode: { type: String, required: true, trim: true, uppercase: true },
    stopName: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    sequence: { type: Number, required: true },
    estimatedArrivalTime: { type: String, trim: true },
    estimatedDepartureTime: { type: String, trim: true },
    landmark: { type: String, trim: true },
    monthlyFare: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

routeStopSchema.index({ schoolId: 1, routeId: 1, sequence: 1 }, { unique: true });
routeStopSchema.index({ schoolId: 1, routeId: 1, stopCode: 1 }, { unique: true });

module.exports = mongoose.model('RouteStop', routeStopSchema);
