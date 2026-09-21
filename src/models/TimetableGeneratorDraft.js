const mongoose = require('mongoose');

/**
 * One in-progress Smart Timetable Generator wizard session per user, so a
 * partially-filled-out run (scope, periods, constraints, lab room picks, etc.)
 * survives a navigation-away or a closed tab. Deliberately a single evolving
 * draft per user, not a named/multi-draft list — the wizard is a linear,
 * one-at-a-time flow. Cleared once the generated timetable is actually saved.
 */
const timetableGeneratorDraftSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currentStep: { type: String, required: true },
    wizardData: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

timetableGeneratorDraftSchema.index({ schoolId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('TimetableGeneratorDraft', timetableGeneratorDraftSchema);
