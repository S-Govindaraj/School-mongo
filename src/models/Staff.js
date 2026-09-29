const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employeeId: { type: String, required: true, trim: true },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    designation: { type: String, required: true, trim: true },
    designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    department: { type: String, trim: true, default: '' },
    joiningDate: { type: Date, default: Date.now },
    qualificationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Qualification' }],
    qualification: { type: String, default: '' },
    experienceYears: { type: Number, default: 0 },
    isTeachingStaff: { type: Boolean, default: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    // Timetable generator inputs. Empty `periods` array means unavailable the whole day;
    // a populated array means unavailable only for those specific periods.
    unavailability: {
      type: [
        {
          dayOfWeek: {
            type: String,
            enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
            required: true,
          },
          periods: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Period' }],
        },
      ],
      default: [],
      _id: false,
    },
    preferredPeriods: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Period' }],
    // Teacher Assigned Grades — the grades this staff member actually
    // teaches, set directly on the Staff form. A simple, always-reliable
    // source for "which teachers belong to grade X" that doesn't depend on
    // TeacherAssignment/timetable data being fully set up — see
    // staffAccessScopeService.js's resolveScopedStaffIds, which unions this
    // with TeacherAssignment and Section.classTeacherId.
    assignedGradeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Grade' }],
    // Staff In-Charge: responsible for every student/staff/guardian tied to
    // these grades, across the Students/Staff/Guardians modules — see
    // staffAccessScopeService.js for how this is resolved into a query scope.
    isIncharge: { type: Boolean, default: false },
    inchargeDetails: {
      gradeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Grade' }],
    },
  },
  { timestamps: true }
);

staffSchema.index({ schoolId: 1, employeeId: 1 }, { unique: true });
staffSchema.index({ schoolId: 1, assignedGradeIds: 1 });

module.exports = mongoose.model('Staff', staffSchema);

