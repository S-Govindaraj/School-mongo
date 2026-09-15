const Vehicle = require('../models/Vehicle');
const Driver = require('../models/Driver');
const TransportRoute = require('../models/TransportRoute');
const RouteStop = require('../models/RouteStop');
const TransportAssignment = require('../models/TransportAssignment');
const TransportAttendance = require('../models/TransportAttendance');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');

// Helper to format standard success API response
const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({
    success: true,
    data,
    meta: { requestId: res.req?.requestId || res.req?.id || 'req_' + Date.now() },
  });
};

// Transport Dashboard Metrics
exports.getDashboard = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const today = new Date().toISOString().split('T')[0];

    const [
      totalVehicles,
      activeVehicles,
      maintenanceVehicles,
      totalDrivers,
      activeRoutes,
      assignedStudents,
      todayAttendance,
      expiringCertificates
    ] = await Promise.all([
      Vehicle.countDocuments({ schoolId }),
      Vehicle.countDocuments({ schoolId, status: 'ACTIVE' }),
      Vehicle.countDocuments({ schoolId, status: 'MAINTENANCE' }),
      Driver.countDocuments({ schoolId, status: 'ACTIVE' }),
      TransportRoute.countDocuments({ schoolId, status: 'ACTIVE' }),
      TransportAssignment.countDocuments({ schoolId, status: 'ACTIVE' }),
      TransportAttendance.countDocuments({ schoolId, date: today }),
      Vehicle.find({
        schoolId,
        $or: [
          { fitnessExpiryDate: { $lte: new Date(Date.now() + 30 * 86400000) } },
          { insuranceExpiryDate: { $lte: new Date(Date.now() + 30 * 86400000) } }
        ]
      }).limit(5)
    ]);

    sendSuccess(res, {
      summary: {
        totalVehicles,
        activeVehicles,
        maintenanceVehicles,
        totalDrivers,
        activeRoutes,
        assignedStudents,
        todayAttendanceCount: todayAttendance
      },
      expiringCertificates
    });
  } catch (err) {
    next(err);
  }
};

// Vehicles CRUD
exports.getVehicles = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const vehicles = await Vehicle.find({ schoolId }).sort({ createdAt: -1 });
    sendSuccess(res, vehicles);
  } catch (err) {
    next(err);
  }
};

exports.createVehicle = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const vehicle = await Vehicle.create({
      ...req.body,
      schoolId,
      createdBy: req.user?._id
    });
    sendSuccess(res, vehicle, 201);
  } catch (err) {
    next(err);
  }
};

exports.updateVehicle = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, schoolId },
      { ...req.body, updatedBy: req.user?._id },
      { new: true }
    );
    sendSuccess(res, vehicle);
  } catch (err) {
    next(err);
  }
};

// Drivers CRUD
exports.getDrivers = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const drivers = await Driver.find({ schoolId }).sort({ createdAt: -1 });
    sendSuccess(res, drivers);
  } catch (err) {
    next(err);
  }
};

exports.createDriver = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const driver = await Driver.create({ ...req.body, schoolId });
    sendSuccess(res, driver, 201);
  } catch (err) {
    next(err);
  }
};

exports.updateDriver = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const driver = await Driver.findOneAndUpdate(
      { _id: req.params.id, schoolId },
      req.body,
      { new: true }
    );
    sendSuccess(res, driver);
  } catch (err) {
    next(err);
  }
};

// Routes & Stops
exports.getRoutes = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const routes = await TransportRoute.find({ schoolId })
      .populate('assignedVehicleId')
      .populate('assignedDriverId')
      .sort({ createdAt: -1 });
    sendSuccess(res, routes);
  } catch (err) {
    next(err);
  }
};

exports.createRoute = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const route = await TransportRoute.create({ ...req.body, schoolId, createdBy: req.user?._id });
    sendSuccess(res, route, 201);
  } catch (err) {
    next(err);
  }
};

exports.updateRoute = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const route = await TransportRoute.findOneAndUpdate(
      { _id: req.params.id, schoolId },
      { ...req.body, updatedBy: req.user?._id },
      { new: true }
    );
    sendSuccess(res, route);
  } catch (err) {
    next(err);
  }
};

exports.getRouteStops = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { routeId } = req.params;
    const stops = await RouteStop.find({ schoolId, routeId }).sort({ sequence: 1 });
    sendSuccess(res, stops);
  } catch (err) {
    next(err);
  }
};

exports.createRouteStop = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const stop = await RouteStop.create({ ...req.body, schoolId });
    sendSuccess(res, stop, 201);
  } catch (err) {
    next(err);
  }
};

// Transport Assignments
exports.getAssignments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const assignments = await TransportAssignment.find({ schoolId })
      .populate('studentId', 'firstName lastName admissionNumber')
      .populate('routeId', 'routeName routeCode')
      .populate('routeStopId', 'stopName estimatedArrivalTime')
      .sort({ createdAt: -1 });
    sendSuccess(res, assignments);
  } catch (err) {
    next(err);
  }
};

exports.createAssignment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;

    // Relationship validation
    const student = await Student.findOne({ _id: req.body.studentId, schoolId });
    if (!student) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Student does not belong to school' } });
    }

    const assignment = await TransportAssignment.create({ ...req.body, schoolId });
    sendSuccess(res, assignment, 201);
  } catch (err) {
    next(err);
  }
};

// Transport Attendance
exports.getAttendance = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { date, routeId } = req.query;
    const filter = { schoolId };
    if (date) filter.date = date;
    if (routeId) filter.routeId = routeId;

    const records = await TransportAttendance.find(filter)
      .populate('studentId', 'firstName lastName admissionNumber')
      .sort({ createdAt: -1 });
    sendSuccess(res, records);
  } catch (err) {
    next(err);
  }
};

exports.markAttendance = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { date, routeId, tripType, records } = req.body;

    const bulkOps = records.map(r => ({
      updateOne: {
        filter: { schoolId, date, routeId, tripType, studentId: r.studentId },
        update: {
          $set: {
            academicYearId: r.academicYearId,
            assignmentId: r.assignmentId,
            vehicleId: r.vehicleId,
            status: r.status,
            markedAt: new Date(),
            markedBy: req.user?._id,
            remarks: r.remarks
          }
        },
        upsert: true
      }
    }));

    if (bulkOps.length > 0) {
      await TransportAttendance.bulkWrite(bulkOps);
    }
    sendSuccess(res, { markedCount: records.length });
  } catch (err) {
    next(err);
  }
};
