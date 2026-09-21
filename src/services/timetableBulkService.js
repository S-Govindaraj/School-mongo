const Timetable = require('../models/Timetable');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { withTransactionOrFallback } = require('../utils/withTransaction');
const { TimetableValidatorService } = require('./timetableValidatorService');

/**
 * The single shared primitive behind manual bulk-edit, drag-and-drop moves,
 * and period swaps — per the non-negotiable that automatic generation,
 * manual edits, drag/drop, swap, and bulk edit all share one conflict
 * engine. Every update in the batch is validated against a shared in-memory
 * context before anything touches the database; if any one of them would
 * create a hard conflict, none are applied.
 */
class TimetableBulkService {
  static async applyBulkUpdate(schoolId, updates, actor, { action = 'BULK_UPDATE' } = {}) {
    if (!updates || !updates.length) throw new ValidationError('No updates provided.');

    const ids = updates.map((u) => u.id);
    const entries = await Timetable.find({ _id: { $in: ids }, schoolId });
    if (entries.length !== ids.length) {
      throw new NotFoundError('One or more timetable entries were not found.');
    }

    const entryById = new Map(entries.map((e) => [String(e._id), e]));
    const lockedEntry = entries.find((e) => e.isLocked);
    if (lockedEntry) {
      throw new ValidationError('One or more selected slots are locked and cannot be modified.');
    }

    const academicYearIds = new Set(entries.map((e) => String(e.academicYearId)));
    if (academicYearIds.size > 1) {
      throw new ValidationError('Cannot batch-update timetable entries across different academic years.');
    }
    const academicYearId = [...academicYearIds][0];

    const ctx = await TimetableValidatorService.buildFullContext({ schoolId, academicYearId });
    // Free the entries' current positions first — they're about to be
    // re-placed (possibly unchanged, possibly moved), so their OLD slot must
    // never be treated as conflicting with their OWN new slot.
    entries.forEach((e) => ctx.remove(e.toObject()));

    const candidates = [];
    for (const update of updates) {
      const entry = entryById.get(update.id);
      const merged = {
        academicYearId: String(entry.academicYearId),
        gradeId: String(entry.gradeId),
        sectionId: String(entry.sectionId),
        dayOfWeek: update.dayOfWeek || entry.dayOfWeek,
        periodId: update.periodId || String(entry.periodId),
        subjectId: update.subjectId || String(entry.subjectId),
        teacherId: update.teacherId || String(entry.teacherId),
        roomId: update.roomId !== undefined ? update.roomId : (entry.roomId ? String(entry.roomId) : undefined),
        roomNumber: update.roomNumber !== undefined ? update.roomNumber : entry.roomNumber,
      };

      const { valid, conflicts } = TimetableValidatorService.validateSlot(merged, ctx, { hardOnly: true });
      if (!valid) {
        const first = conflicts.find((c) => c.severity === 'HARD') || conflicts[0];
        const err = new ValidationError(first.message, conflicts);
        err.timetableId = update.id;
        throw err;
      }

      ctx.place(merged);
      candidates.push({ id: update.id, merged });
    }

    return withTransactionOrFallback(async (session) => {
      const opts = session ? { session } : {};
      for (const c of candidates) {
        const original = entryById.get(c.id);
        const nextSource = (original.source === 'AUTO_GENERATED' || original.source === 'AUTO_GENERATED_THEN_EDITED')
          ? 'AUTO_GENERATED_THEN_EDITED'
          : original.source;
        await Timetable.updateOne(
          { _id: c.id, schoolId },
          {
            $set: {
              dayOfWeek: c.merged.dayOfWeek,
              periodId: c.merged.periodId,
              subjectId: c.merged.subjectId,
              teacherId: c.merged.teacherId,
              roomId: c.merged.roomId || null,
              roomNumber: c.merged.roomNumber || '',
              source: nextSource,
            },
          },
          opts
        );
      }

      await logAuditEvent({
        schoolId,
        actorId: actor?._id,
        actorName: actor?.name,
        actorEmail: actor?.email,
        action,
        entity: 'Timetable',
        details: { count: candidates.length, ids },
      });

      return candidates.length;
    });
  }

  static async swap(schoolId, timetableIdA, timetableIdB, actor) {
    const [a, b] = await Promise.all([
      Timetable.findOne({ _id: timetableIdA, schoolId }).lean(),
      Timetable.findOne({ _id: timetableIdB, schoolId }).lean(),
    ]);
    if (!a || !b) throw new NotFoundError('One or both timetable entries were not found.');

    const updates = [
      { id: timetableIdA, dayOfWeek: b.dayOfWeek, periodId: String(b.periodId) },
      { id: timetableIdB, dayOfWeek: a.dayOfWeek, periodId: String(a.periodId) },
    ];
    return this.applyBulkUpdate(schoolId, updates, actor, { action: 'SWAP' });
  }
}

module.exports = { TimetableBulkService };
