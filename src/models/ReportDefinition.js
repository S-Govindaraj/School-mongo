const mongoose = require('mongoose');

const reportDefinitionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    reportCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    module: {
      type: String,
      enum: ['STUDENT', 'ACADEMIC', 'ATTENDANCE', 'EXAM', 'FINANCE', 'TRANSPORT', 'LIBRARY', 'STAFF', 'COMMUNICATION', 'OPERATIONS'],
      required: true,
    },
    category: { type: String, default: 'GENERAL' },
    filters: [{ type: String }], // e.g. ['academicYear', 'grade', 'section', 'dateRange']
    columns: [
      {
        field: String,
        label: String,
        type: { type: String, enum: ['TEXT', 'NUMBER', 'DATE', 'CURRENCY', 'BOOLEAN', 'STATUS', 'PERCENTAGE'], default: 'TEXT' },
        sortable: { type: Boolean, default: true },
        visible: { type: Boolean, default: true },
      },
    ],
    defaultSort: { field: String, order: { type: String, enum: ['asc', 'desc'], default: 'asc' } },
    permissions: [{ type: String }],
    exportFormats: [{ type: String, enum: ['CSV', 'EXCEL', 'PDF'], default: 'CSV' }],
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

reportDefinitionSchema.index({ schoolId: 1, reportCode: 1 }, { unique: true });
reportDefinitionSchema.index({ schoolId: 1, module: 1 });

module.exports = mongoose.model('ReportDefinition', reportDefinitionSchema);
