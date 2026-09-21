const mongoose = require('mongoose');

/**
 * Which instructional Periods (school-wide records) apply to a given
 * Grade + Section for a given Academic Year — different grades commonly run
 * different numbers of periods per day (e.g. Grade 1 = 4, Grade 5 = 8), so
 * the Smart Timetable Generator must generate against this selection, not
 * against every Period the school has ever configured.
 */
const gradeSectionPeriodConfigSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    periodIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Period' }],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

gradeSectionPeriodConfigSchema.index(
  { schoolId: 1, academicYearId: 1, gradeId: 1, sectionId: 1 },
  { unique: true }
);

module.exports = mongoose.model('GradeSectionPeriodConfig', gradeSectionPeriodConfigSchema);
