const Timetable = require('../models/Timetable');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

class TimetableLockService {
  static async lock(schoolId, id, actor) {
    const entry = await Timetable.findOne({ _id: id, schoolId });
    if (!entry) throw new NotFoundError('Timetable entry not found');
    if (entry.status !== 'ACTIVE') throw new ValidationError('Only active timetable entries can be locked.');

    entry.isLocked = true;
    await entry.save();

    await logAuditEvent({
      schoolId,
      actorId: actor?._id,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action: 'LOCK',
      entity: 'Timetable',
      entityId: id,
    });

    return entry;
  }

  static async unlock(schoolId, id, actor) {
    const entry = await Timetable.findOne({ _id: id, schoolId });
    if (!entry) throw new NotFoundError('Timetable entry not found');

    entry.isLocked = false;
    await entry.save();

    await logAuditEvent({
      schoolId,
      actorId: actor?._id,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action: 'UNLOCK',
      entity: 'Timetable',
      entityId: id,
    });

    return entry;
  }
}

module.exports = { TimetableLockService };
