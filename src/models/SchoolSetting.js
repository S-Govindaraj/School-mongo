const mongoose = require('mongoose');

const DEFAULT_GRADING_THRESHOLDS = [
  { grade: 'A+', min: 90, description: 'Outstanding' },
  { grade: 'A', min: 80, description: 'Excellent' },
  { grade: 'B+', min: 70, description: 'Very Good' },
  { grade: 'B', min: 60, description: 'Good' },
  { grade: 'C', min: 50, description: 'Satisfactory' },
  { grade: 'D', min: 35, description: 'Pass' },
  { grade: 'F', min: 0, description: 'Fail' },
];

const schoolSettingSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },

    // 1. General & Academic Configuration
    academic: {
      academicYearFormat: { type: String, default: 'YYYY-YY' },
      dateFormat: { type: String, default: 'DD/MM/YYYY' },
      timeFormat: { type: String, default: '12_HOUR', enum: ['12_HOUR', '24_HOUR'] },
      weekStartDay: { type: String, default: 'MONDAY', enum: ['MONDAY', 'SUNDAY'] },
      workingDaysPerWeek: { type: Number, default: 6, min: 4, max: 7 },
      periodDurationMinutes: { type: Number, default: 45, min: 15, max: 120 },
      dailyPeriodsCount: { type: Number, default: 8, min: 1, max: 15 },
    },

    // 2. Attendance Configuration
    attendance: {
      mode: { type: String, default: 'DAILY_ONCE', enum: ['DAILY_ONCE', 'SUBJECT_WISE'] },
      allowBackdated: { type: Boolean, default: true },
      backdateLimitDays: { type: Number, default: 3, min: 0, max: 60 },
      lowAttendanceThreshold: { type: Number, default: 75, min: 0, max: 100 },
      notifyAbsenceToParents: { type: Boolean, default: true },
      enableStaffAttendance: { type: Boolean, default: true },
    },

    // 3. Student & Identity Configuration
    student: {
      idPrefix: { type: String, default: 'STU-' },
      idFormat: { type: String, default: 'STU-{YYYY}-{SEQ}' },
      admissionPrefix: { type: String, default: 'ADM-' },
      idGeneration: { type: String, default: 'AUTO_INCREMENT', enum: ['AUTO_INCREMENT', 'MANUAL'] },
      defaultStatus: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'PENDING_VERIFICATION'] },
      autoCreateUserAccount: { type: Boolean, default: true },
    },

    // 4. Examination & Grading Configuration
    examination: {
      gradingMode: { type: String, default: 'PERCENTAGE', enum: ['PERCENTAGE', 'GPA_4', 'LETTER_GRADES', 'MARKS_AND_GRADES'] },
      allowDecimalMarks: { type: Boolean, default: false },
      passingPercentage: { type: Number, default: 35, min: 0, max: 100 },
      showRankOnReportCard: { type: Boolean, default: true },
      gradingThresholds: {
        type: [
          {
            grade: { type: String, required: true },
            min: { type: Number, required: true },
            description: { type: String, default: '' },
          },
        ],
        default: DEFAULT_GRADING_THRESHOLDS,
      },
    },

    // 5. Fees & Financial Configuration
    fees: {
      currency: { type: String, default: 'INR' },
      invoicePrefix: { type: String, default: 'INV-' },
      receiptPrefix: { type: String, default: 'RCP-' },
      paymentDueDays: { type: Number, default: 15, min: 1, max: 90 },
      lateFeeGracePeriodDays: { type: Number, default: 5, min: 0, max: 30 },
      autoGenerateInvoiceOnTerm: { type: Boolean, default: false },
    },

    // 6. Security & System Configuration
    security: {
      sessionTimeoutMinutes: { type: Number, default: 30, min: 5, max: 240 },
      enforce2FA: { type: Boolean, default: false },
      emailNotificationsEnabled: { type: Boolean, default: true },
      smsNotificationsEnabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SchoolSetting', schoolSettingSchema);
module.exports.DEFAULT_GRADING_THRESHOLDS = DEFAULT_GRADING_THRESHOLDS;
