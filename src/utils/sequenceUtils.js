const Setting = require('../models/Setting');
const SchoolSetting = require('../models/SchoolSetting');

/**
 * Safely generates atomic sequence numbers for Admissions, Students, Invoices, Payments, Receipts, Refunds.
 * Uses school-configured prefixes from SchoolSetting (with fallback to defaults).
 * E.g., ADM-2026-00001, STU-2026-00001, INV-2026-00001, PAY-2026-00001, REC-2026-00001, RFD-2026-00001
 */
const generateSequenceNumber = async (schoolId, type = 'STUDENT') => {
  const year = new Date().getFullYear();
  let prefix = type.substring(0, 3).toUpperCase();

  try {
    if (schoolId) {
      const schoolSetting = await SchoolSetting.findOne({ schoolId }).lean();
      if (schoolSetting) {
        if (type === 'STUDENT' && schoolSetting.student?.idPrefix) {
          prefix = schoolSetting.student.idPrefix.replace(/[-_]$/, '');
        } else if (type === 'ADMISSION' && schoolSetting.student?.admissionPrefix) {
          prefix = schoolSetting.student.admissionPrefix.replace(/[-_]$/, '');
        } else if (type === 'INVOICE' && schoolSetting.fees?.invoicePrefix) {
          prefix = schoolSetting.fees.invoicePrefix.replace(/[-_]$/, '');
        } else if (type === 'RECEIPT' && schoolSetting.fees?.receiptPrefix) {
          prefix = schoolSetting.fees.receiptPrefix.replace(/[-_]$/, '');
        }
      }
    }
  } catch (_) {
    // Fall back to hardcoded prefix if lookup fails
  }

  // Fallback defaults if prefix not found
  if (!prefix) {
    if (type === 'STUDENT') prefix = 'STU';
    else if (type === 'ADMISSION') prefix = 'ADM';
    else if (type === 'INVOICE') prefix = 'INV';
    else if (type === 'PAYMENT') prefix = 'PAY';
    else if (type === 'RECEIPT') prefix = 'REC';
    else if (type === 'REFUND') prefix = 'RFD';
    else if (type === 'ADJUSTMENT') prefix = 'ADJ';
    else prefix = type.substring(0, 3).toUpperCase();
  }

  const category = 'SEQUENCE';
  const key = `${type}_COUNTER_${year}`;

  const setting = await Setting.findOneAndUpdate(
    { schoolId, category, key },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const num = String(setting.value || 1).padStart(5, '0');
  return `${prefix}-${year}-${num}`;
};

module.exports = {
  generateSequenceNumber,
};
