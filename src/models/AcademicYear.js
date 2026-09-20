const mongoose = require('mongoose');

const academicYearSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    isCurrent: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'INACTIVE',
    },
  },
  { timestamps: true }
);

// Pre-save normalization and business rule validation
academicYearSchema.pre('validate', function (next) {
  if (this.code) {
    const match = String(this.code)
      .trim()
      .match(/^(\d{4})\s*-\s*(\d{4})$/);

    if (match) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);

      if (end !== start + 1) {
        return next(
          new Error(
            'The ending year must be exactly one year after the starting year.'
          )
        );
      }

      this.code = `${match[1]}-${match[2]}`;

      if (
        !this.name ||
        this.name.trim() === '' ||
        /^(\d{4})\s*-\s*(\d{4})$/.test(this.name.trim())
      ) {
        this.name = `${match[1]}-${match[2]}`;
      }
    } else {
      this.code = String(this.code).trim();
    }
  }

  if (this.name) {
    const nameMatch = String(this.name)
      .trim()
      .match(/^(\d{4})\s*-\s*(\d{4})$/);

    if (nameMatch) {
      this.name = `${nameMatch[1]}-${nameMatch[2]}`;
    } else {
      this.name = String(this.name).trim();
    }
  }

  next();
});

// Virtual populate
academicYearSchema.virtual('terms', {
  ref: 'AcademicTerm',
  localField: '_id',
  foreignField: 'academicYearId',
  justOne: false,
});

// Include virtuals in API response
academicYearSchema.set('toObject', { virtuals: true });
academicYearSchema.set('toJSON', { virtuals: true });

// Database Constraints
academicYearSchema.index(
  { schoolId: 1, code: 1 },
  { unique: true }
);

academicYearSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true }
);

academicYearSchema.index(
  { schoolId: 1, isCurrent: 1 },
  {
    unique: true,
    partialFilterExpression: { isCurrent: true },
  }
);

module.exports = mongoose.model('AcademicYear', academicYearSchema);