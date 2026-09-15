const Setting = require('../models/Setting');

/**
 * Safely generates atomic sequence numbers for Admissions, Students, Invoices, Payments, Receipts, Refunds.
 * E.g., ADM-2026-00001, STU-2026-00001, INV-2026-00001, PAY-2026-00001, REC-2026-00001, RFD-2026-00001
 */
const generateSequenceNumber = async (schoolId, type = 'STUDENT') => {
  const year = new Date().getFullYear();
  let prefix = 'STU';
  if (type === 'ADMISSION') prefix = 'ADM';
  else if (type === 'INVOICE') prefix = 'INV';
  else if (type === 'PAYMENT') prefix = 'PAY';
  else if (type === 'RECEIPT') prefix = 'REC';
  else if (type === 'REFUND') prefix = 'RFD';
  else if (type === 'ADJUSTMENT') prefix = 'ADJ';
  else prefix = type.substring(0, 3).toUpperCase();

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
