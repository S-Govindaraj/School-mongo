const Timetable = require('../models/Timetable');
const ClassSubject = require('../models/ClassSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const Section = require('../models/Section');
const Grade = require('../models/Grade');
const Subject = require('../models/Subject');
const GradeSectionPeriodConfig = require('../models/GradeSectionPeriodConfig');
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

/**
 * Different grades commonly run different numbers of periods per day (e.g.
 * Grade 1 = 4, Grade 5 = 8), so the generator must never assume one global
 * period count. For each section, resolve its SELECTED instructional periods
 * (GradeSectionPeriodConfig) — falling back to every ACTIVE INSTRUCTIONAL
 * period in the school when nothing has been explicitly selected yet, so
 * generation still works before anyone has visited the Periods step.
 * Returns Map<sectionId, sortedPeriodDocs[]>.
 */
const resolveSectionPeriods = async ({ schoolId, academicYearId, sections, ctx, gradesById }) => {
  const allInstructional = [...ctx.periods.values()]
    .filter((p) => p.status === 'ACTIVE' && (p.type ? p.type === 'INSTRUCTIONAL' : !p.isBreak))
    .sort((a, b) => a.sequence - b.sequence);

  const configs = await GradeSectionPeriodConfig.find({
    schoolId,
    academicYearId,
    sectionId: { $in: sections.map((s) => s._id) },
  }).lean();
  const configBySection = new Map(configs.map((c) => [String(c.sectionId), c]));

  const bySection = new Map();
  for (const section of sections) {
    const grade = gradesById?.get(String(section.gradeId));
    if (grade && Array.isArray(grade.periods) && grade.periods.length > 0) {
      const gradeInstructional = grade.periods
        .map((pid) => ctx.periods.get(String(pid)))
        .filter((p) => p && p.status === 'ACTIVE' && (p.type ? p.type === 'INSTRUCTIONAL' : !p.isBreak))
        .sort((a, b) => a.sequence - b.sequence);
      bySection.set(String(section._id), gradeInstructional.length ? gradeInstructional : allInstructional);
      continue;
    }
    const config = configBySection.get(String(section._id));
    if (config && config.periodIds?.length) {
      const selected = config.periodIds
        .map((pid) => ctx.periods.get(String(pid)))
        .filter((p) => p && p.status === 'ACTIVE' && (p.type ? p.type === 'INSTRUCTIONAL' : !p.isBreak))
        .sort((a, b) => a.sequence - b.sequence);
      bySection.set(String(section._id), selected.length ? selected : allInstructional);
    } else {
      bySection.set(String(section._id), allInstructional);
    }
  }
  return bySection;
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

const difficultyScore = (variable, ctx, teacherLoad, slotsForSection) => {
  const teacherUnitCount = teacherLoad.get(variable.teacherId) || 1;
  const teacher = ctx.staffById.get(variable.teacherId);
  const unavailableSlots = (teacher?.unavailability || []).reduce(
    (sum, u) => sum + (u.periods?.length ? u.periods.length : slotsForSection / 7),
    0
  );
  return (
    (variable.isDouble ? 1000 : 0) +
    teacherUnitCount * 50 +
    unavailableSlots * 20 +
    (variable.weeklyPeriods / Math.max(1, slotsForSection)) * 10
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
const runGeneration = ({ variables, slotDomainBySection, ctx, academicYearId, constraints, requestSeed }) => {
  const rng = seededRandom(hashString(requestSeed));
  const teacherLoad = new Map();
  variables.forEach((v) => teacherLoad.set(v.teacherId, (teacherLoad.get(v.teacherId) || 0) + 1));
  const slotsForVariable = (v) => slotDomainBySection.get(v.sectionId)?.singles.length || 1;

  const order = [...variables].sort((a, b) => difficultyScore(b, ctx, teacherLoad, slotsForVariable(b)) - difficultyScore(a, ctx, teacherLoad, slotsForVariable(a)));

  const assigned = []; // [{variable, slots: [placedSlot,...]}]
  const tabu = new Map(); // variableId -> Set of candidate keys already tried & backtracked away from
  const usedDaysBySubject = new Map(); // `${sectionId}|${subjectId}` -> Set(day)
  const unscheduled = [];
  const startedAt = Date.now();
  let backtracks = 0;

  const candidateKey = (v, c) => (v.isDouble ? `${c.dayOfWeek}:${c.periodId}:${c.periodId2}` : `${c.dayOfWeek}:${c.periodId}`);

  const domainFor = (variable) => {
    const domain = slotDomainBySection.get(variable.sectionId);
    return variable.isDouble ? domain?.doubles || [] : domain?.singles || [];
  };

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

    const gradeIdSet = [...new Set(sections.map((s) => String(s.gradeId)))];
    const gradesInScope = await Grade.find({ _id: { $in: gradeIdSet }, schoolId }).lean();
    const gradesById = new Map(gradesInScope.map((g) => [String(g._id), g]));

    // Each section uses only its OWN selected instructional periods — different
    // grades commonly run different period counts (e.g. Grade 1 = 4, Grade 5 = 8),
    // so this must never assume one global period count for every section.
    const periodsBySection = await resolveSectionPeriods({ schoolId, academicYearId, sections, ctx, gradesById });
    const slotDomainBySection = new Map();
    for (const section of sections) {
      const sectionId = String(section._id);
      const sortedPeriods = periodsBySection.get(sectionId) || [];
      if (!sortedPeriods.length) {
        throw new ValidationError(
          `No active instructional periods are selected for ${section.name}. Configure/select instructional periods for this Grade + Section before generating.`
        );
      }
      slotDomainBySection.set(sectionId, buildSlotDomain(selectedDays, sortedPeriods));
    }

    const { variables, unassignedRequirements } = await buildRequirementVariables({
      schoolId,
      academicYearId,
      gradeIds,
      sections,
      allowDoublePeriods,
      ctx,
      regenerateSubjectId,
    });

    if (!regenerateSubjectId) {
      for (const g of gradesInScope) {
        const configuredPeriods = Array.isArray(g.periods) ? g.periods : [];
        if (configuredPeriods.length > 0) {
          const gradeSections = sections.filter((s) => String(s.gradeId) === String(g._id));
          const requiredCount = configuredPeriods.length * gradeSections.length;
          const assignedCount = variables
            .filter((v) => String(v.gradeId) === String(g._id))
            .reduce((sum, v) => sum + (v.isDouble ? 2 : 1), 0);

          if (assignedCount !== requiredCount) {
            if (assignedCount < requiredCount) {
              const diff = requiredCount - assignedCount;
              throw new ValidationError(
                `Exact period requirement not satisfied for ${g.name}: ${diff} period(s) are missing (${assignedCount} assigned vs ${requiredCount} required across ${gradeSections.length} section(s)). Please adjust Class Subjects configuration.`
              );
            } else {
              const diff = assignedCount - requiredCount;
              throw new ValidationError(
                `Exact period requirement exceeded for ${g.name}: ${assignedCount} assigned periods exceeds the required ${requiredCount} periods by ${diff} period(s) across ${gradeSections.length} section(s). Please adjust Class Subjects configuration.`
              );
            }
          }
        }
      }
    }

    // Required vs available is checked PER SECTION — a section with fewer
    // selected periods (e.g. Grade 1) must never be judged against another
    // section's larger capacity (e.g. Grade 5).
    const requiredBySection = new Map();
    variables.forEach((v) => {
      requiredBySection.set(v.sectionId, (requiredBySection.get(v.sectionId) || 0) + (v.isDouble ? 2 : 1));
    });
    const overCapacity = [];
    let totalAvailableSlots = 0;
    let totalRequiredSlots = 0;
    for (const section of sections) {
      const sectionId = String(section._id);
      const available = slotDomainBySection.get(sectionId).singles.length;
      const required = requiredBySection.get(sectionId) || 0;
      totalAvailableSlots += available;
      totalRequiredSlots += required;
      if (required > available) {
        overCapacity.push({ sectionName: section.name, required, available });
      }
    }
    if (overCapacity.length) {
      const detail = overCapacity.map((o) => `${o.sectionName}: required ${o.required}, available ${o.available}`).join('; ');
      throw new ValidationError(
        `Cannot generate timetable — required weekly subject periods exceed available instructional slots for: ${detail}. Please adjust the subject weekly periods or select additional instructional periods.`
      );
    }

    const result = runGeneration({
      variables,
      slotDomainBySection,
      ctx,
      academicYearId,
      constraints: constraints || {},
      requestSeed: `${schoolId}:${academicYearId}:${sections.map((s) => s._id).join(',')}:${Date.now()}`,
    });

    return {
      summary: {
        availableSlots: totalAvailableSlots,
        requiredSlots: totalRequiredSlots,
        remainingSlots: totalAvailableSlots - totalRequiredSlots,
        bySection: sections.map((s) => {
          const sectionId = String(s._id);
          return {
            sectionId,
            sectionName: s.name,
            availableSlots: slotDomainBySection.get(sectionId).singles.length,
            requiredSlots: requiredBySection.get(sectionId) || 0,
            selectedPeriodCount: (periodsBySection.get(sectionId) || []).length,
          };
        }),
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

    // Load full school context so all sections, grades, teachers, rooms across the school are available for exact conflict resolution
    const ctx = await TimetableValidatorService.buildFullContext({ schoolId, academicYearId });

    // Free the target sections' own current slots from the fresh context so
    // the plan we're about to re-place isn't rejected as conflicting with the
    // very entries it's meant to replace. Include any non-archived (ACTIVE or INACTIVE)
    // entries so stale drafts are also cleared in REPLACE mode.
    let replacedQuery = null;
    if (mode === 'REPLACE') {
      replacedQuery = { schoolId, academicYearId, sectionId: { $in: targetSectionIds }, status: { $ne: 'ARCHIVED' }, isLocked: { $ne: true } };
    } else if (mode === 'REGENERATE_SUBJECT') {
      if (!subjectId) throw new ValidationError('subjectId is required when mode is REGENERATE_SUBJECT.');
      replacedQuery = { schoolId, academicYearId, sectionId: { $in: targetSectionIds }, subjectId, status: { $ne: 'ARCHIVED' }, isLocked: { $ne: true } };
    }
    const toReplace = replacedQuery ? await Timetable.find(replacedQuery).lean() : [];
    toReplace.forEach((entry) => ctx.remove(entry));

    if (mode !== 'REGENERATE_SUBJECT' && Array.isArray(targetSectionIds) && targetSectionIds.length > 0) {
      const targetSecs = targetSectionIds.map((id) => ctx.sections.get(String(id))).filter(Boolean);
      const gradeIds = [...new Set(targetSecs.map((s) => String(s.gradeId)))];
      const gradesInScope = await Grade.find({ _id: { $in: gradeIds }, schoolId }).lean();
      for (const g of gradesInScope) {
        const configuredPeriods = Array.isArray(g.periods) ? g.periods : [];
        if (configuredPeriods.length > 0) {
          const gSecs = targetSecs.filter((s) => String(s.gradeId) === String(g._id));
          const required = configuredPeriods.length * gSecs.length;
          const assigned = (slots || []).filter((s) => gSecs.some((sec) => String(sec._id) === String(s.sectionId))).length;
          if (assigned !== required) {
            throw new ValidationError(
              `Cannot save timetable: exact period requirement not satisfied for ${g.name}. Required: ${required}, provided: ${assigned}.`
            );
          }
        }
      }
    }

    const formatSlotInfo = (slot) => {
      if (!slot) return { sectionName: 'Section', day: '', periodLabel: 'Period', subjectName: 'Subject', teacherName: 'Teacher', roomName: '' };
      const sec = ctx.sections.get(String(slot.sectionId));
      const grd = sec ? ctx.grades.get(String(sec.gradeId)) : (slot.gradeId ? ctx.grades.get(String(slot.gradeId)) : null);
      const per = ctx.periods.get(String(slot.periodId));
      const sub = ctx.subjects.get(String(slot.subjectId));
      const tch = ctx.staffById.get(String(slot.teacherId));
      const rm = slot.roomId ? ctx.rooms.get(String(slot.roomId)) : null;

      const secName = sec ? (grd ? `${grd.name} - Section ${sec.name}` : `Section ${sec.name}`) : (grd ? `${grd.name} Section` : 'Section');
      const perLabel = per ? (per.name || `Period ${per.periodNumber || per.sequence || ''}`).trim() : 'Period';
      const subName = sub ? sub.name : 'Subject';
      const tchName = tch ? `${tch.firstName || ''} ${tch.lastName || ''}`.trim() : 'Teacher';
      const rmName = rm ? rm.name : (slot.roomNumber ? `Room ${slot.roomNumber}` : '');

      return {
        sectionName: secName,
        day: slot.dayOfWeek || '',
        periodLabel: perLabel,
        subjectName: subName,
        teacherName: tchName,
        roomName: rmName,
      };
    };

    const seenKeys = new Map();
    const validated = [];
    const conflictErrors = [];

    for (const slot of slots) {
      const dedupeKey = `${slot.sectionId}|${slot.dayOfWeek}|${slot.periodId}`;
      if (seenKeys.has(dedupeKey)) {
        const info = formatSlotInfo(slot);
        conflictErrors.push(
          `${info.sectionName} • ${info.day} ${info.periodLabel}: Duplicate period in submitted schedule (${info.subjectName} with ${info.teacherName}).`
        );
        continue;
      }
      seenKeys.set(dedupeKey, slot);

      const candidate = { ...slot, academicYearId };
      const { valid, conflicts } = TimetableValidatorService.validateSlot(candidate, ctx, { hardOnly: true });
      if (!valid) {
        const info = formatSlotInfo(slot);
        for (const c of conflicts) {
          conflictErrors.push(
            `${info.sectionName} • ${info.day} ${info.periodLabel}: ${c.message} (${info.subjectName} - ${info.teacherName}${info.roomName ? ` in ${info.roomName}` : ''})`
          );
        }
      } else {
        ctx.place(candidate);
        validated.push(candidate);
      }
    }

    if (conflictErrors.length > 0) {
      throw new ValidationError(
        conflictErrors[0] || 'A conflicting timetable entry already exists.',
        conflictErrors
      );
    }

    try {
      return await withTransactionOrFallback(async (session) => {
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
    } catch (dbErr) {
      if (
        dbErr.code === 11000 ||
        dbErr.code === 11001 ||
        (dbErr.message && (dbErr.message.includes('E11000') || dbErr.message.includes('duplicate key')))
      ) {
        const dbConflicts = [];

        // 1. Direct inspection: Extract exact duplicate key from MongoDB driver error
        const writeErr = dbErr.writeErrors?.[0] || dbErr;
        let keyValue = writeErr.keyValue || writeErr.err?.keyValue || dbErr.keyValue || null;
        const errmsg = writeErr.errmsg || writeErr.err?.errmsg || dbErr.message || '';

        if (!keyValue && errmsg) {
          const match = errmsg.match(/dup key: (\{.*?\})/);
          if (match) {
            try {
              keyValue = {};
              const idMatches = [...match[1].matchAll(/([a-zA-Z0-9]+):\s*(?:ObjectId\('([a-f0-9]+)'\)|"([^"]+)")/g)];
              for (const m of idMatches) {
                keyValue[m[1]] = m[2] || m[3];
              }
            } catch (_) {}
          }
        }

        if (keyValue && (keyValue.sectionId || keyValue.teacherId || keyValue.roomId || keyValue.roomNumber)) {
          const query = { schoolId, academicYearId };
          if (keyValue.sectionId) query.sectionId = keyValue.sectionId;
          if (keyValue.teacherId) query.teacherId = keyValue.teacherId;
          if (keyValue.roomId) query.roomId = keyValue.roomId;
          if (keyValue.roomNumber) query.roomNumber = keyValue.roomNumber;
          if (keyValue.dayOfWeek) query.dayOfWeek = keyValue.dayOfWeek;
          if (keyValue.periodId) query.periodId = keyValue.periodId;

          const matchDoc = await Timetable.findOne(query).lean();
          if (matchDoc) {
            const mInfo = formatSlotInfo(matchDoc);
            const statusLabel = matchDoc.status && matchDoc.status !== 'ACTIVE' ? ` (${matchDoc.status.toLowerCase()})` : '';
            if (keyValue.sectionId) {
              dbConflicts.push(
                `${mInfo.sectionName} • ${mInfo.day} ${mInfo.periodLabel}: Class already has an existing timetable entry for ${mInfo.subjectName} with teacher ${mInfo.teacherName}${mInfo.roomName ? ` in ${mInfo.roomName}` : ''}${statusLabel}. Please choose "Replace" mode to overwrite prior entries.`
              );
            } else if (keyValue.teacherId) {
              dbConflicts.push(
                `${mInfo.sectionName} • ${mInfo.day} ${mInfo.periodLabel}: Teacher ${mInfo.teacherName} is already assigned during this period for ${mInfo.subjectName}${statusLabel}.`
              );
            } else if (keyValue.roomId || keyValue.roomNumber) {
              dbConflicts.push(
                `${mInfo.sectionName} • ${mInfo.day} ${mInfo.periodLabel}: Room ${mInfo.roomName || 'selected'} is already occupied during this period by ${mInfo.sectionName} (${mInfo.subjectName})${statusLabel}.`
              );
            }
          }
        }

        // 2. Scan all non-archived entries in the academic year for full collision coverage
        const existingEntries = await Timetable.find({
          schoolId,
          academicYearId,
          status: { $ne: 'ARCHIVED' },
          _id: { $nin: toReplace.map((e) => e._id) },
        }).lean();

        const existingSectionMap = new Map();
        const existingTeacherMap = new Map();
        const existingRoomMap = new Map();

        existingEntries.forEach((e) => {
          existingSectionMap.set(`${e.sectionId}|${e.dayOfWeek}|${e.periodId}`, e);
          existingTeacherMap.set(`${e.teacherId}|${e.dayOfWeek}|${e.periodId}`, e);
          if (e.roomId) existingRoomMap.set(`id:${e.roomId}|${e.dayOfWeek}|${e.periodId}`, e);
          else if (e.roomNumber) existingRoomMap.set(`num:${e.roomNumber}|${e.dayOfWeek}|${e.periodId}`, e);
        });

        const internalSection = new Map();
        const internalTeacher = new Map();
        const internalRoom = new Map();

        for (const slot of validated) {
          const info = formatSlotInfo(slot);
          const sKey = `${slot.sectionId}|${slot.dayOfWeek}|${slot.periodId}`;
          const tKey = `${slot.teacherId}|${slot.dayOfWeek}|${slot.periodId}`;
          const rKey = slot.roomId ? `id:${slot.roomId}|${slot.dayOfWeek}|${slot.periodId}` : slot.roomNumber ? `num:${slot.roomNumber}|${slot.dayOfWeek}|${slot.periodId}` : null;

          if (existingSectionMap.has(sKey)) {
            const ex = existingSectionMap.get(sKey);
            const exInfo = formatSlotInfo(ex);
            const statusLabel = ex.status && ex.status !== 'ACTIVE' ? ` (${ex.status.toLowerCase()})` : '';
            const msg = `${info.sectionName} • ${info.day} ${info.periodLabel}: Class already has an existing timetable entry (${exInfo.subjectName} with teacher ${exInfo.teacherName}${exInfo.roomName ? ` in ${exInfo.roomName}` : ''}${statusLabel}). Choose "Replace" mode to overwrite prior entries.`;
            if (!dbConflicts.includes(msg)) dbConflicts.push(msg);
          } else if (internalSection.has(sKey)) {
            const msg = `${info.sectionName} • ${info.day} ${info.periodLabel}: Class has duplicate periods in generated schedule.`;
            if (!dbConflicts.includes(msg)) dbConflicts.push(msg);
          }
          internalSection.set(sKey, slot);

          if (existingTeacherMap.has(tKey)) {
            const ex = existingTeacherMap.get(tKey);
            const exInfo = formatSlotInfo(ex);
            const statusLabel = ex.status && ex.status !== 'ACTIVE' ? ` (${ex.status.toLowerCase()})` : '';
            const msg = `${info.sectionName} • ${info.day} ${info.periodLabel}: Teacher ${info.teacherName} is already assigned to ${exInfo.sectionName} (${exInfo.subjectName}${statusLabel}) during this period.`;
            if (!dbConflicts.includes(msg)) dbConflicts.push(msg);
          } else if (internalTeacher.has(tKey)) {
            const other = internalTeacher.get(tKey);
            const otherInfo = formatSlotInfo(other);
            const msg = `${info.sectionName} • ${info.day} ${info.periodLabel}: Teacher ${info.teacherName} is double-booked with ${otherInfo.sectionName} during this period.`;
            if (!dbConflicts.includes(msg)) dbConflicts.push(msg);
          }
          internalTeacher.set(tKey, slot);

          if (rKey) {
            if (existingRoomMap.has(rKey)) {
              const ex = existingRoomMap.get(rKey);
              const exInfo = formatSlotInfo(ex);
              const statusLabel = ex.status && ex.status !== 'ACTIVE' ? ` (${ex.status.toLowerCase()})` : '';
              const msg = `${info.sectionName} • ${info.day} ${info.periodLabel}: Room ${info.roomName || 'selected'} is already occupied by ${exInfo.sectionName} (${exInfo.subjectName}${statusLabel}) during this period.`;
              if (!dbConflicts.includes(msg)) dbConflicts.push(msg);
            } else if (internalRoom.has(rKey)) {
              const other = internalRoom.get(rKey);
              const otherInfo = formatSlotInfo(other);
              const msg = `${info.sectionName} • ${info.day} ${info.periodLabel}: Room ${info.roomName || 'selected'} is double-booked with ${otherInfo.sectionName} during this period.`;
              if (!dbConflicts.includes(msg)) dbConflicts.push(msg);
            }
            internalRoom.set(rKey, slot);
          }
        }

        if (dbConflicts.length > 0) {
          throw new ValidationError(
            dbConflicts[0],
            dbConflicts
          );
        }

        // If for any reason still no detailed match, extract readable IDs from keyValue or errmsg
        const fallbackDetail = keyValue
          ? `Colliding slot: ${keyValue.dayOfWeek || ''} ${keyValue.periodId ? `Period ID: ${keyValue.periodId}` : ''} ${keyValue.sectionId ? `Section ID: ${keyValue.sectionId}` : ''} ${keyValue.teacherId ? `Teacher ID: ${keyValue.teacherId}` : ''}`.trim()
          : (errmsg || 'A conflicting timetable entry already exists.');

        throw new ValidationError(
          'A conflicting timetable entry already exists for the selected academic year and period.',
          [fallbackDetail]
        );
      }
      throw dbErr;
    }
  }
}

module.exports = {
  TimetableGeneratorService,
  // Exposed for direct unit testing of the CSP core without a live DB.
  _internal: { buildSlotDomain, runGeneration, difficultyScore },
};
