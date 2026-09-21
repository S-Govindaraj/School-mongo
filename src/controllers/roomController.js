const Room = require('../models/Room');
const Timetable = require('../models/Timetable');
const Section = require('../models/Section');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const validateRoom = async (schoolId, data, currentId = null) => {
  const name = String(data.name || '').trim();
  if (!name) throw new ValidationError('Room name is required.');

  const nameQuery = { schoolId, name, status: { $ne: 'ARCHIVED' } };
  if (currentId) nameQuery._id = { $ne: currentId };

  const existing = await Room.findOne(nameQuery).lean();
  if (existing) throw new ValidationError(`Room '${name}' already exists in this school.`);
};

const getRooms = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }

    const rooms = await Room.find(filter).sort({ name: 1 }).lean();
    return successResponse(res, rooms, 'Rooms retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createRoom = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    await validateRoom(schoolId, req.body);

    const { name, campusId, capacity, isLab = false, status: requestedStatus } = req.body;
    const status = requestedStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';

    const room = await Room.create({
      schoolId,
      campusId: campusId || undefined,
      name: String(name).trim(),
      capacity: Number(capacity) || 30,
      isLab: Boolean(isLab),
      status,
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'CREATE',
      entity: 'Room',
      entityId: room._id.toString(),
      newValues: room.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, room, 'Room created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateRoom = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const room = await Room.findOne({ _id: id, schoolId });
    if (!room) throw new NotFoundError('Room not found');

    const merged = { ...room.toObject(), ...req.body };
    await validateRoom(schoolId, merged, id);

    const oldValues = room.toObject();
    Object.assign(room, req.body);
    await room.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'UPDATE',
      entity: 'Room',
      entityId: room._id.toString(),
      oldValues,
      newValues: room.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, room, 'Room updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteRoom = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const room = await Room.findOne({ _id: id, schoolId });
    if (!room) throw new NotFoundError('Room not found');

    const [hasTimetable, hasSection] = await Promise.all([
      Timetable.countDocuments({ schoolId, roomId: id, status: { $ne: 'ARCHIVED' } }),
      Section.countDocuments({ schoolId, roomId: id, status: { $ne: 'ARCHIVED' } }),
    ]);

    if (hasTimetable > 0 || hasSection > 0) {
      throw new ValidationError(
        'This room cannot be deactivated because active timetable slots or sections reference it.'
      );
    }

    room.status = 'INACTIVE';
    await room.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'Room',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Room deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreRoom = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const room = await Room.findOne({ _id: id, schoolId });
    if (!room) throw new NotFoundError('Room not found');

    room.status = 'ACTIVE';
    await room.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'Room',
      entityId: room._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, room, 'Room activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  restoreRoom,
};
