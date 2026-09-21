const Timetable = require('../models/Timetable');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const Section = require('../models/Section');
const Subject = require('../models/Subject');
const { ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { withTransactionOrFallback } = require('../utils/withTransaction');
const { TimetableValidatorService } = require('./timetableValidatorService');

const DEFAULT_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const LAB_TYPES = new Set(['LAB', 'PRACTICAL']);
const BACKTRACK_BUDGET_PER_VARIABLE = 40;
const WALL_CLOCK_TIMEOUT_MS = 8000;

/** Deterministic-ish shuffle seeded from a simple hash, so scoring ties don't always break the same way but a re-run of the same request is reproducible. */
const seededRandom = (seed) => {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};
const hashString = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
};

/**
 * Expand ClassSubject.weeklyPeriods × TeacherAssignment into per-section unit
 * variables (pairing into double-blocks for lab/practical subjects when
 * allowed). Any periods already covered by a LOCKED existing slot for that
 * section+subject count toward the weekly target and are subtracted from
 * what the generator needs to newly place — locked cells are immutable, so
 * the algorithm must never try to schedule on top of or in addition to them.
 * `regenerateSubjectId`, when set, confines the whole requirement set to
 * just that one subject (Mode 4 — regenerate subject).
 */
const buildRequirementVariables = async ({ schoolId, academicYearId, gradeIds, sections, allowDoublePeriods, ctx, regenerateSubjectId }) => {
  const gradeIdSet = new Set((gradeIds || []).map(String).concat(sections.map((s) => String(s.gradeId))));

  const [classSubjects, assignments, subjects] = await Promise.all([
    ClassSubject.find({ schoolId, academicYearId, gradeId: { $in: [...gradeIdSet] }, status: { $ne: 'ARCHIVED' } }).lean(),
    TeacherAssignment.find({ schoolId, academicYearId, sectionId: { $in: sections.map((s) => s._id) }, status: { $ne: 'ARCHIVED' } }).lean(),
    Subject.find({ schoolId, status: { $ne: 'ARCHIVED' } }).lean(),
  ]);

  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
  const assignmentsBySectionSubject = new Map();
  assignments.forEach((a) => {
    const key = `${a.sectionId}|${a.subjectId}`;
    if (!assignmentsBySectionSubject.has(key)) assignmentsBySectionSubject.set(key, a); // PRIMARY/first wins
  });

  const variables = [];
  const unassignedRequirements = [];

  for (const section of sections) {
    let gradeSubjects = classSubjects.filter((cs) => String(cs.gradeId) === String(section.gradeId));
    if (regenerateSubjectId) {
      gradeSubjects = gradeSubjects.filter((cs) => String(cs.subjectId) === String(regenerateSubjectId));
    }
    for (const cs of gradeSubjects) {
      const key = `${section._id}|${cs.subjectId}`;
      const assignment = assignmentsBySectionSubject.get(key);
      const subject = subjectById.get(String(cs.subjectId));
      if (!assignment) {
        unassignedRequirements.push({
          sectionId: String(section._id),
          sectionName: section.name,
          gradeId: String(section.gradeId),
          subjectId: String(cs.subjectId),
          subjectName: subject?.name || 'Unknown subject',
          reason: `${subject?.name || 'This subject'} does not have an eligible teacher assignment for ${section.name}.`,
        });
        continue;
      }

      const weeklyPeriods = Math.max(1, Number(cs.weeklyPeriods) || 1);
      const lockedCount = ctx?.lockedCountBySectionSubject?.get(`${section._id}|${cs.subjectId}`) || 0;
      const isLab = subject && LAB_TYPES.has(subject.type);
      const canDouble = allowDoublePeriods && isLab;

      let remaining = Math.max(0, weeklyPeriods - lockedCount);
      let unitIndex = 0;
      while (remaining > 0) {
        const isDouble = canDouble && remaining >= 2;
        variables.push({
          id: `${section._id}:${cs.subjectId}:${unitIndex++}`,
          sectionId: String(section._id),
          sectionName: section.name,
          gradeId: String(section.gradeId),
          subjectId: String(cs.subjectId),
          subjectName: subject?.name || 'Subject',
          teacherId: String(assignment.staffId),
          isDouble,
          weeklyPeriods,
        });
        remaining -= isDouble ? 2 : 1;
      }
    }
  }

  return { variables, unassignedRequirements };
};

/** All (day, period) domain slots, and adjacent pairs for double-period variables. */
const buildSlotDomain = (days, sortedPeriods) => {
  const singles = [];
  const doublesByDay = new Map();
  for (const day of days) {
    for (let i = 0; i < sortedPeriods.length; i++) {
      const period = sortedPeriods[i];
      singles.push({ dayOfWeek: day, periodId: String(period._id) });
      const next = sortedPeriods[i + 1];
      if (next && next.sequence === period.sequence + 1) {
        const list = doublesByDay.get(day) || [];
        list.push({ dayOfWeek: day, periodId: String(period._id), periodId2: String(next._id) });
        doublesByDay.set(day, list);
      }
    }
  }
  const doubles = [].concat(...doublesByDay.values());
  return { singles, doubles };
};

const difficultyScore = (variable, ctx, teacherLoad, totalNonBreakSlots) => {
  const teacherUnitCount = teacherLoad.get(variable.teacherId) || 1;
  const teacher = ctx.staffById.get(variable.teacherId);
  const unavailableSlots = (teacher?.unavailability || []).reduce(
    (sum, u) => sum + (u.periods?.length ? u.periods.length : totalNonBreakSlots / 7),
    0
  );
  return (
    (variable.isDouble ? 1000 : 0) +
    teacherUnitCount * 50 +
    unavailableSlots * 20 +
    (variable.weeklyPeriods / Math.max(1, totalNonBreakSlots)) * 10
  );
};

const toSlot = (variable, candidate, academicYearId) => ({
  academicYearId,
  gradeId: variable.gradeId,
  sectionId: variable.sectionId,
  dayOfWeek: candidate.dayOfWeek,
  periodId: candidate.periodId,
  subjectId: variable.subjectId,
  teacherId: variable.teacherId,
});

const scoreCandidate = (variable, candidate, ctx, constraints, usedDaysForSubject) => {
  let score = 0;
  // Distribution: favor days this subject hasn't used yet for this section this week.
  score += usedDaysForSubject.has(candidate.dayOfWeek) ? -5 * (constraints.distributionWeight ?? 5) : 2 * (constraints.distributionWeight ?? 5);
  // Preferred periods (teacher-level hint).
  const teacher = ctx.staffById.get(variable.teacherId);
  if (teacher?.preferredPeriods?.length) {
    const preferred = teacher.preferredPeriods.map(String);
    if (preferred.includes(candidate.periodId)) score += (constraints.preferredPeriodsWeight ?? 3) * 3;
  }
  return score;
};

/**
 * CSP-with-backtracking placement loop. Hard constraints prune the domain;
 * soft constraints (scoreCandidate) rank what's left. When a variable has no
 * live candidates, the most recently placed variable sharing its teacher or
 * section is evicted (backtrack) and retried, bounded by a budget so a truly
 * impossible configuration still returns promptly with a structured report
 * instead of hanging.
 */
const runGeneration = ({ variables, singles, doubles, ctx, academicYearId, constraints, requestSeed }) => {
  const rng = seededRandom(hashString(requestSeed));
  const teacherLoad = new Map();
  variables.forEach((v) => teacherLoad.set(v.teacherId, (teacherLoad.get(v.teacherId) || 0) + 1));
  const totalNonBreakSlots = singles.length;

  const order = [...variables].sort((a, b) => difficultyScore(b, ctx, teacherLoad, totalNonBreakSlots) - difficultyScore(a, ctx, teacherLoad, totalNonBreakSlots));

  const assigned = []; // [{variable, slots: [placedSlot,...]}]
  const tabu = new Map(); // variableId -> Set of candidate keys already tried & backtracked away from
  const usedDaysBySubject = new Map(); // `${sectionId}|${subjectId}` -> Set(day)
  const unscheduled = [];
  const startedAt = Date.now();
  let backtracks = 0;

  const candidateKey = (v, c) => (v.isDouble ? `${c.dayOfWeek}:${c.periodId}:${c.periodId2}` : `${c.dayOfWeek}:${c.periodId}`);

  const domainFor = (variable) => (variable.isDouble ? doubles : singles);

  const isCandidateValid = (variable, candidate) => {
    const slot1 = toSlot(variable, candidate, academicYearId);
    const r1 = TimetableValidatorService.validateSlot(slot1, ctx, { hardOnly: true, constraints });
    if (!r1.valid) return { valid: false, conflicts: r1.conflicts };
    if (!variable.isDouble) return { valid: true };
    const slot2 = toSlot(variable, { dayOfWeek: candidate.dayOfWeek, periodId: candidate.periodId2 }, academicYearId);
    const r2 = TimetableValidatorService.validateSlot(slot2, ctx, { hardOnly: true, constraints });
    return { valid: r2.valid, conflicts: r2.conflicts };
  };

  const placeVariable = (variable, candidate) => {
    const usedKey = `${variable.sectionId}|${variable.subjectId}`;
    const usedDays = usedDaysBySubject.get(usedKey) || new Set();
    const slots = [toSlot(variable, candidate, academicYearId)];
    if (variable.isDouble) slots.push(toSlot(variable, { dayOfWeek: candidate.dayOfWeek, periodId: candidate.periodId2 }, academicYearId));
    slots.forEach((s) => ctx.place(s));
    usedDays.add(candidate.dayOfWeek);
    usedDaysBySubject.set(usedKey, usedDays);
    assigned.push({ variable, candidate, slots });
  };

  const unplaceLast = () => {
    const last = assigned.pop();
    last.slots.forEach((s) => ctx.remove(s));
    return last;
  };

  const explainFailure = (variable) => {
    const domain = domainFor(variable);
    const counts = new Map();
    for (const c of domain) {
      const { valid, conflicts } = isCandidateValid(variable, c);
      if (!valid) {
        (conflicts || []).filter((cf) => cf.severity === 'HARD').forEach((cf) => counts.set(cf.type, (counts.get(cf.type) || 0) + 1));
      }
    }
    const blockedBy = [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    return {
      sectionId: variable.sectionId,
      sectionName: variable.sectionName,
      subjectId: variable.subjectId,
      subjectName: variable.subjectName,
      teacherId: variable.teacherId,
      reason: 'No slot satisfies all hard constraints for this requirement.',
      blockedBy,
    };
  };

  let i = 0;
  while (i < order.length) {
    if (Date.now() - startedAt > WALL_CLOCK_TIMEOUT_MS) {
      for (let j = i; j < order.length; j++) unscheduled.push(explainFailure(order[j]));
      break;
    }
    const variable = order[i];
    const domain = domainFor(variable);
    const tried = tabu.get(variable.id) || new Set();
    const live = domain.filter((c) => !tried.has(candidateKey(variable, c)) && isCandidateValid(variable, c).valid);

    if (live.length === 0) {
      // Try to backtrack: evict the most recent placement sharing this variable's teacher or section.
      const victimIdx = [...assigned.keys()].reverse().find((idx) => {
        const a = assigned[idx];
        return a.variable.teacherId === variable.teacherId || a.variable.sectionId === variable.sectionId;
      });
      if (victimIdx === undefined || backtracks >= BACKTRACK_BUDGET_PER_VARIABLE * order.length) {
        unscheduled.push(explainFailure(variable));
        i++;
        continue;
      }
      // Evict everything placed after (and including) the victim, then retry from the victim's
      // position in `order` — freeing its slot and re-opening every variable placed after it.
      const victimVariableId = assigned[victimIdx].variable.id;
      while (assigned.length > victimIdx) {
        const evicted = unplaceLast();
        const evictedTabu = tabu.get(evicted.variable.id) || new Set();
        evictedTabu.add(candidateKey(evicted.variable, evicted.candidate));
        tabu.set(evicted.variable.id, evictedTabu);
      }
      backtracks++;
      i = order.findIndex((v) => v.id === victimVariableId);
      continue;
    }

    const usedKey = `${variable.sectionId}|${variable.subjectId}`;
    const usedDays = usedDaysBySubject.get(usedKey) || new Set();
    const scored = live.map((c) => ({ c, score: scoreCandidate(variable, c, ctx, constraints, usedDays) + rng() * 0.01 }));
    scored.sort((a, b) => b.score - a.score);
    placeVariable(variable, scored[0].c);
    i++;
  }

  const slots = assigned.flatMap((a) => a.slots);
  const warnings = [];
  slots.forEach((s) => {
    const { conflicts } = TimetableValidatorService.validateSlot(s, ctx, { hardOnly: false, constraints });
    conflicts.filter((c) => c.severity === 'SOFT').forEach((c) => warnings.push({ ...c, sectionId: s.sectionId, subjectId: s.subjectId, dayOfWeek: s.dayOfWeek }));
  });

  return {
    slots,
    unscheduled,
    warnings,
    stats: {
      totalRequirements: variables.length,
      placed: assigned.length,
      unscheduledCount: unscheduled.length,
      backtracks,
      durationMs: Date.now() - startedAt,
    },
  };
};

class TimetableGeneratorService {
  /**
   * Stateless preview — nothing is written to the database. The client holds
   * the returned slots[] and re-submits them verbatim to saveGeneration().
   */
  static async previewGeneration(schoolId, params) {
    const { academicYearId, campusId, gradeIds = [], sectionIds = [], days, allowDoublePeriods, constraints, regenerateSubjectId } = params;
    const selectedDays = days?.length ? days : DEFAULT_DAYS;

    const sectionFilter = { schoolId, status: { $ne: 'ARCHIVED' } };
    if (sectionIds.length) sectionFilter._id = { $in: sectionIds };
    else if (gradeIds.length) sectionFilter.gradeId = { $in: gradeIds };
    else throw new ValidationError('Select at least one grade or section to generate a timetable for.');

    const sections = await Section.find(sectionFilter).lean();
    if (!sections.length) throw new ValidationError('No matching sections found for the selected scope.');

    const ctx = await TimetableValidatorService.buildFullContext({
      schoolId,
      academicYearId,
      campusId,
      sectionIds: sections.map((s) => s._id),
    });

    if (regenerateSubjectId) {
      // Mode 4 (regenerate subject): every OTHER subject's existing slots stay
      // fixed occupants in the context. This subject's own NON-LOCKED slots
      // are freed so it can be re-placed; its LOCKED slots stay put and were
      // already subtracted from its weekly requirement above.
      const sectionIdSet = new Set(sections.map((s) => String(s._id)));
      const ownSlots = await Timetable.find({
        schoolId,
        academicYearId,
        sectionId: { $in: [...sectionIdSet] },
        subjectId: regenerateSubjectId,
        status: 'ACTIVE',
        isLocked: { $ne: true },
      }).lean();
      ownSlots.forEach((slot) => ctx.remove(slot));
    }

    const sortedPeriods = [...ctx.periods.values()].filter((p) => !p.isBreak).sort((a, b) => a.sequence - b.sequence);
    if (!sortedPeriods.length) throw new ValidationError('No active, non-break periods are configured for this school.');

    const { singles, doubles } = buildSlotDomain(selectedDays, sortedPeriods);
    const availableSlots = singles.length;

    const { variables, unassignedRequirements } = await buildRequirementVariables({
      schoolId,
      academicYearId,
      gradeIds,
      sections,
      allowDoublePeriods,
      ctx,
      regenerateSubjectId,
    });

    const requiredSlots = variables.reduce((sum, v) => sum + (v.isDouble ? 2 : 1), 0);
    if (requiredSlots > availableSlots * sections.length) {
      throw new ValidationError(
        `Timetable cannot be generated because the selected subjects require ${requiredSlots} periods, but only ${availableSlots * sections.length} periods are available across the selected section(s).`
      );
    }

    const result = runGeneration({
      variables,
      singles,
      doubles,
      ctx,
      academicYearId,
      constraints: constraints || {},
      requestSeed: `${schoolId}:${academicYearId}:${sections.map((s) => s._id).join(',')}:${Date.now()}`,
    });

    return {
      summary: {
        availableSlots: availableSlots * sections.length,
        requiredSlots,
        remainingSlots: availableSlots * sections.length - requiredSlots,
        ...result.stats,
      },
      slots: result.slots,
      unscheduled: [...unassignedRequirements.map((u) => ({ ...u, blockedBy: [] })), ...result.unscheduled],
      warnings: result.warnings,
      sections: sections.map((s) => ({ id: String(s._id), name: s.name, gradeId: String(s.gradeId) })),
    };
  }

  /**
   * Transactional save. Re-validates every submitted slot against a FRESH
   * context (not the stale preview-time one) so concurrent edits made while
   * the wizard was open are caught — either everything saves, or nothing does.
   */
  static async saveGeneration(schoolId, params, actor) {
    const { academicYearId, mode, targetSectionIds, subjectId, slots } = params;

    const ctx = await TimetableValidatorService.buildFullContext({ schoolId, academicYearId, sectionIds: targetSectionIds });

    // Free the target sections' own current slots from the fresh context so
    // the plan we're about to re-place isn't rejected as conflicting with the
    // very entries it's meant to replace — via ctx.remove() (not a partial Map
    // delete) so the teacher/room/daily-count/sequence indexes all clear
    // correctly too, not just the section index. LOCKED slots are never
    // removed — they stay as fixed, immutable occupants either way.
    let replacedQuery = null;
    if (mode === 'REPLACE') {
      replacedQuery = { schoolId, academicYearId, sectionId: { $in: targetSectionIds }, status: 'ACTIVE', isLocked: { $ne: true } };
    } else if (mode === 'REGENERATE_SUBJECT') {
      if (!subjectId) throw new ValidationError('subjectId is required when mode is REGENERATE_SUBJECT.');
      replacedQuery = { schoolId, academicYearId, sectionId: { $in: targetSectionIds }, subjectId, status: 'ACTIVE', isLocked: { $ne: true } };
    }
    const toReplace = replacedQuery ? await Timetable.find(replacedQuery).lean() : [];
    toReplace.forEach((entry) => ctx.remove(entry));

    const seenKeys = new Set();
    const validated = [];
    for (const slot of slots) {
      const dedupeKey = `${slot.sectionId}|${slot.dayOfWeek}|${slot.periodId}`;
      if (seenKeys.has(dedupeKey)) {
        throw new ValidationError(`Timetable changed since generation. Duplicate slot in submitted schedule: ${dedupeKey}. Please review the highlighted conflicts.`);
      }
      seenKeys.add(dedupeKey);

      const candidate = { ...slot, academicYearId };
      const { valid, conflicts } = TimetableValidatorService.validateSlot(candidate, ctx, { hardOnly: true });
      if (!valid) {
        throw new ValidationError(`Timetable changed since generation. ${conflicts[0].message} Please review the highlighted conflicts.`);
      }
      ctx.place(candidate);
      validated.push(candidate);
    }

    return withTransactionOrFallback(async (session) => {
      const opts = session ? { session } : {};
      if (toReplace.length) {
        await Timetable.updateMany(
          { _id: { $in: toReplace.map((e) => e._id) } },
          { $set: { status: 'ARCHIVED' } },
          opts
        );
      }

      const now = new Date();
      const docs = validated.map((s) => ({
        schoolId,
        academicYearId,
        gradeId: s.gradeId,
        sectionId: s.sectionId,
        dayOfWeek: s.dayOfWeek,
        periodId: s.periodId,
        subjectId: s.subjectId,
        teacherId: s.teacherId,
        roomId: s.roomId || undefined,
        roomNumber: s.roomNumber ? String(s.roomNumber).trim() : '',
        status: 'ACTIVE',
        source: 'AUTO_GENERATED',
        generatedAt: now,
        generatedBy: actor?._id,
      }));

      const created = await Timetable.insertMany(docs, { ...opts, ordered: true });

      await logAuditEvent({
        schoolId,
        actorId: actor?._id,
        actorName: actor?.name,
        actorEmail: actor?.email,
        action: mode === 'REGENERATE_SUBJECT' ? 'REGENERATE_SUBJECT' : mode === 'REPLACE' ? 'GENERATE_REPLACE' : 'GENERATE_MERGE',
        entity: 'Timetable',
        details: {
          generator: true,
          mode,
          academicYearId,
          targetSectionIds,
          subjectId: subjectId || undefined,
          entriesCreated: created.length,
          entriesArchived: toReplace.length,
          // Passed through from the preview response purely for the audit
          // record — the save step itself never trusts these numbers, only
          // the fresh re-validation above.
          generationSummary: params.generationSummary || undefined,
        },
      });

      return created;
    });
  }
}

module.exports = {
  TimetableGeneratorService,
  // Exposed for direct unit testing of the CSP core without a live DB.
  _internal: { buildSlotDomain, runGeneration, difficultyScore },
};
