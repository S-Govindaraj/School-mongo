/**
 * Phase 8 — Visitor & Gate Pass Controller
 */
const Visitor = require('../models/Visitor');
const VisitorAppointment = require('../models/VisitorAppointment');
const GatePass = require('../models/GatePass');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

// ─── Visitors ────────────────────────────────────────────
exports.listVisitors = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.date) filter.date = req.query.date;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [total, visitors] = await Promise.all([
      Visitor.countDocuments(filter),
      Visitor.find(filter).sort({ checkInTime: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return successResponse(res, visitors, 'Visitors retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

exports.checkIn = async (req, res, next) => {
  try {
    const { name, phone, idType, idNumber, purpose, hostName, hostType, photoUrl, vehicleNumber } = req.body;
    if (!name || !purpose) throw new ValidationError('name and purpose required');
    const visitor = await Visitor.create({
      schoolId: req.schoolContext.schoolId,
      name, phone, idType, idNumber, purpose, hostName, hostType, photoUrl, vehicleNumber,
      date: new Date().toISOString().slice(0, 10),
      checkInTime: new Date(),
      status: 'INSIDE',
      checkedInBy: req.user._id,
    });
    await logAudit(req, 'visitor_checkin', 'Visitor', visitor._id, null, visitor.toObject());
    return successResponse(res, visitor, 'Visitor checked in', 201);
  } catch (err) { next(err); }
};

exports.checkOut = async (req, res, next) => {
  try {
    const visitor = await Visitor.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!visitor) throw new NotFoundError('Visitor not found');
    if (visitor.status !== 'INSIDE') throw new ForbiddenError('Visitor is not checked in');
    visitor.checkOutTime = new Date();
    visitor.status = 'CHECKED_OUT';
    visitor.checkedOutBy = req.user._id;
    await visitor.save();
    await logAudit(req, 'visitor_checkout', 'Visitor', visitor._id, null, null);
    return successResponse(res, visitor, 'Visitor checked out');
  } catch (err) { next(err); }
};

// ─── Appointments ────────────────────────────────────────
exports.listAppointments = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.date) filter.scheduledDate = req.query.date;
    if (req.query.status) filter.status = req.query.status;
    const appts = await VisitorAppointment.find(filter)
      .populate('hostId', 'firstName lastName')
      .sort({ scheduledDate: 1, scheduledTime: 1 }).lean();
    return successResponse(res, appts, 'Appointments retrieved');
  } catch (err) { next(err); }
};

exports.createAppointment = async (req, res, next) => {
  try {
    const { visitorName, visitorPhone, purpose, hostId, hostType, scheduledDate, scheduledTime, notes } = req.body;
    if (!visitorName || !scheduledDate || !hostId) throw new ValidationError('visitorName, scheduledDate, hostId required');
    const appt = await VisitorAppointment.create({
      schoolId: req.schoolContext.schoolId,
      visitorName, visitorPhone, purpose, hostId, hostType, scheduledDate, scheduledTime, notes,
      status: 'SCHEDULED', createdBy: req.user._id,
    });
    return successResponse(res, appt, 'Appointment created', 201);
  } catch (err) { next(err); }
};

// ─── Gate Pass ───────────────────────────────────────────
exports.listGatePasses = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.passType) filter.passType = req.query.passType;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [total, passes] = await Promise.all([
      GatePass.countDocuments(filter),
      GatePass.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return successResponse(res, passes, 'Gate passes retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

exports.createGatePass = async (req, res, next) => {
  try {
    const { passType, personId, personType, reason, validFrom, validTo, approvedBy } = req.body;
    if (!passType || !personId || !reason) throw new ValidationError('passType, personId, reason required');
    const passNumber = `GP-${Date.now()}`;
    const pass = await GatePass.create({
      schoolId: req.schoolContext.schoolId, passType, personId, personType,
      reason, validFrom, validTo, passNumber, approvedBy,
      status: 'ACTIVE', issuedBy: req.user._id,
    });
    await logAudit(req, 'gate_pass_create', 'GatePass', pass._id, null, pass.toObject());
    return successResponse(res, pass, 'Gate pass created', 201);
  } catch (err) { next(err); }
};

exports.useGatePass = async (req, res, next) => {
  try {
    const pass = await GatePass.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!pass) throw new NotFoundError('Gate pass not found');
    if (pass.status !== 'ACTIVE') throw new ForbiddenError('Gate pass is not active');
    if (pass.validTo && new Date(pass.validTo) < new Date()) throw new ForbiddenError('Gate pass has expired');
    pass.status = 'USED';
    pass.usedAt = new Date();
    await pass.save();
    return successResponse(res, pass, 'Gate pass used');
  } catch (err) { next(err); }
};
