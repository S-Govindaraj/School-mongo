const Timetable = require('../models/Timetable');
const { ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

/**
 * Publishing is deliberately layered on top of the existing ACTIVE/INACTIVE/
 * ARCHIVED status machine rather than replacing it (that status already
 * drives the conflict-detection unique indexes — changing its meaning would
 * be a breaking change). "Published" here means stamping publishedAt/
 * publishedBy on already-ACTIVE, already-conflict-validated entries, as an
 * explicit, separately-permissioned, audited step distinct from saving.
 */
class TimetablePublishService {
  static async publish(schoolId, { academicYearId, sectionIds }, actor) {
    const entries = await Timetable.find({
      schoolId,
      academicYearId,
      sectionId: { $in: sectionIds },
      status: 'ACTIVE',
    });

    if (!entries.length) {
      throw new ValidationError('No active timetable entries found for the selected section(s) to publish.');
    }

    const now = new Date();
    await Timetable.updateMany(
      { _id: { $in: entries.map((e) => e._id) } },
      { $set: { publishedAt: now, publishedBy: actor?._id } }
    );

    await logAuditEvent({
      schoolId,
      actorId: actor?._id,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action: 'PUBLISH',
      entity: 'Timetable',
      details: { count: entries.length, academicYearId, sectionIds },
    });

    return { count: entries.length, publishedAt: now };
  }
}

module.exports = { TimetablePublishService };
