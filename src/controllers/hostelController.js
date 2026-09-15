/**
 * Phase 8 — Hostel Controller
 */
const Hostel = require('../models/Hostel');
const HostelBlock = require('../models/HostelBlock');
const HostelRoom = require('../models/HostelRoom');
const HostelBed = require('../models/HostelBed');
const HostelAllocation = require('../models/HostelAllocation');
const HostelAttendance = require('../models/HostelAttendance');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

// ─── Hostels ─────────────────────────────────────────────
exports.listHostels = async (req, res, next) => {
  try {
    const hostels = await Hostel.find({ schoolId: req.schoolContext.schoolId }).lean();
    return successResponse(res, hostels, 'Hostels retrieved');
  } catch (err) { next(err); }
};

exports.createHostel = async (req, res, next) => {
  try {
    const { code, name, type, warden, contact, capacity } = req.body;
    if (!code || !name) throw new ValidationError('code and name required');
    const hostel = await Hostel.create({ schoolId: req.schoolContext.schoolId, code, name, type, warden, contact, capacity });
    await logAudit(req, 'hostel_create', 'Hostel', hostel._id, null, hostel.toObject());
    return successResponse(res, hostel, 'Hostel created', 201);
  } catch (err) { next(err); }
};

// ─── Blocks ──────────────────────────────────────────────
exports.listBlocks = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.hostelId) filter.hostelId = req.query.hostelId;
    const blocks = await HostelBlock.find(filter).populate('hostelId', 'name').lean();
    return successResponse(res, blocks, 'Hostel blocks retrieved');
  } catch (err) { next(err); }
};

exports.createBlock = async (req, res, next) => {
  try {
    const { hostelId, code, name, floor } = req.body;
    if (!hostelId || !code || !name) throw new ValidationError('hostelId, code, name required');
    const block = await HostelBlock.create({ schoolId: req.schoolContext.schoolId, hostelId, code, name, floor });
    return successResponse(res, block, 'Block created', 201);
  } catch (err) { next(err); }
};

// ─── Rooms ───────────────────────────────────────────────
exports.listRooms = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.blockId) filter.blockId = req.query.blockId;
    if (req.query.hostelId) filter.hostelId = req.query.hostelId;
    if (req.query.type) filter.roomType = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    const rooms = await HostelRoom.find(filter)
      .populate('blockId', 'name code')
      .populate('hostelId', 'name').lean();
    return successResponse(res, rooms, 'Rooms retrieved');
  } catch (err) { next(err); }
};

exports.createRoom = async (req, res, next) => {
  try {
    const { hostelId, blockId, roomNumber, floor, roomType, capacity, monthlyFee, amenities } = req.body;
    if (!hostelId || !roomNumber) throw new ValidationError('hostelId and roomNumber required');
    const room = await HostelRoom.create({
      schoolId: req.schoolContext.schoolId, hostelId, blockId, roomNumber, floor, roomType, capacity, monthlyFee, amenities
    });
    return successResponse(res, room, 'Room created', 201);
  } catch (err) { next(err); }
};

// ─── Beds ────────────────────────────────────────────────
exports.listBeds = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.roomId) filter.roomId = req.query.roomId;
    if (req.query.isOccupied !== undefined) filter.isOccupied = req.query.isOccupied === 'true';
    const beds = await HostelBed.find(filter).populate('roomId', 'roomNumber').lean();
    return successResponse(res, beds, 'Beds retrieved');
  } catch (err) { next(err); }
};

// ─── Allocations ─────────────────────────────────────────
exports.listAllocations = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.roomId) filter.roomId = req.query.roomId;
    if (req.query.status) filter.status = req.query.status;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [total, allocs] = await Promise.all([
      HostelAllocation.countDocuments(filter),
      HostelAllocation.find(filter)
        .populate('studentId', 'firstName lastName rollNumber')
        .populate('roomId', 'roomNumber roomType')
        .populate('bedId', 'bedNumber')
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return successResponse(res, allocs, 'Allocations retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

exports.allocate = async (req, res, next) => {
  try {
    const { studentId, hostelId, roomId, bedId, checkInDate, expectedCheckOut, monthlyFee } = req.body;
    if (!studentId || !hostelId || !roomId) throw new ValidationError('studentId, hostelId, roomId required');

    // Check for existing active allocation
    const existing = await HostelAllocation.findOne({ studentId, schoolId: req.schoolContext.schoolId, status: 'ACTIVE' });
    if (existing) throw new ForbiddenError('Student already has an active hostel allocation');

    // Check room availability
    const room = await HostelRoom.findById(roomId);
    if (!room) throw new NotFoundError('Room not found');
    if (room.status === 'FULL') throw new ForbiddenError('Room is full');

    const alloc = await HostelAllocation.create({
      schoolId: req.schoolContext.schoolId, studentId, hostelId, roomId, bedId,
      checkInDate: checkInDate || new Date(), expectedCheckOut, monthlyFee, status: 'ACTIVE',
      allocatedBy: req.user._id,
    });

    // Mark bed as occupied
    if (bedId) await HostelBed.findByIdAndUpdate(bedId, { isOccupied: true, currentStudentId: studentId });
    // Update room occupancy
    await HostelRoom.findByIdAndUpdate(roomId, { $inc: { currentOccupancy: 1 } });

    await logAudit(req, 'hostel_allocate', 'HostelAllocation', alloc._id, null, alloc.toObject());
    return successResponse(res, alloc, 'Student allocated to hostel', 201);
  } catch (err) { next(err); }
};

exports.vacate = async (req, res, next) => {
  try {
    const alloc = await HostelAllocation.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!alloc) throw new NotFoundError('Allocation not found');
    if (alloc.status !== 'ACTIVE') throw new ForbiddenError('Allocation is not active');
    alloc.status = 'VACATED';
    alloc.checkOutDate = req.body.checkOutDate || new Date();
    alloc.vacatedBy = req.user._id;
    alloc.vacateReason = req.body.reason;
    await alloc.save();
    if (alloc.bedId) await HostelBed.findByIdAndUpdate(alloc.bedId, { isOccupied: false, currentStudentId: null });
    await HostelRoom.findByIdAndUpdate(alloc.roomId, { $inc: { currentOccupancy: -1 } });
    await logAudit(req, 'hostel_vacate', 'HostelAllocation', alloc._id, null, alloc.toObject());
    return successResponse(res, alloc, 'Student vacated from hostel');
  } catch (err) { next(err); }
};

// ─── Hostel Attendance ───────────────────────────────────
exports.markHostelAttendance = async (req, res, next) => {
  try {
    const { date, records } = req.body;
    if (!date || !Array.isArray(records) || !records.length) throw new ValidationError('date and records[] required');
    const ops = records.map((r) => ({
      updateOne: {
        filter: { studentId: r.studentId, date, schoolId: req.schoolContext.schoolId },
        update: {
          $set: { ...r, date, schoolId: req.schoolContext.schoolId, markedBy: req.user._id }
        },
        upsert: true,
      },
    }));
    const result = await HostelAttendance.bulkWrite(ops);
    return successResponse(res, { upserted: result.upsertedCount, modified: result.modifiedCount }, 'Hostel attendance marked');
  } catch (err) { next(err); }
};
