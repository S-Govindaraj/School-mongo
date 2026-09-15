/**
 * Phase 8 — Payroll Controller
 */
const PayrollPeriod = require('../models/PayrollPeriod');
const PayrollEntry = require('../models/PayrollEntry');
const Payslip = require('../models/Payslip');
const SalaryComponent = require('../models/SalaryComponent');
const SalaryStructure = require('../models/SalaryStructure');
const EmployeeSalaryAssignment = require('../models/EmployeeSalaryAssignment');
const PayrollAdjustment = require('../models/PayrollAdjustment');
const Staff = require('../models/Staff');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

// ─── Salary Components ───────────────────────────────────
exports.listComponents = async (req, res, next) => {
  try {
    const components = await SalaryComponent.find({ schoolId: req.schoolContext.schoolId }).sort({ name: 1 }).lean();
    return successResponse(res, components, 'Salary components retrieved');
  } catch (err) { next(err); }
};

exports.createComponent = async (req, res, next) => {
  try {
    const { code, name, type, calcType, value, isActive } = req.body;
    if (!code || !name || !type) throw new ValidationError('code, name, type required');
    const comp = await SalaryComponent.create({ schoolId: req.schoolContext.schoolId, code, name, type, calcType, value, isActive });
    return successResponse(res, comp, 'Salary component created', 201);
  } catch (err) { next(err); }
};

exports.updateComponent = async (req, res, next) => {
  try {
    const comp = await SalaryComponent.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!comp) throw new NotFoundError('Salary component not found');
    ['name', 'calcType', 'value', 'isActive'].forEach((k) => { if (req.body[k] !== undefined) comp[k] = req.body[k]; });
    await comp.save();
    return successResponse(res, comp, 'Salary component updated');
  } catch (err) { next(err); }
};

// ─── Salary Structures ───────────────────────────────────
exports.listStructures = async (req, res, next) => {
  try {
    const structures = await SalaryStructure.find({ schoolId: req.schoolContext.schoolId }).lean();
    return successResponse(res, structures, 'Salary structures retrieved');
  } catch (err) { next(err); }
};

exports.createStructure = async (req, res, next) => {
  try {
    const { code, name, components, applicableFor } = req.body;
    if (!code || !name) throw new ValidationError('code and name required');
    const struct = await SalaryStructure.create({ schoolId: req.schoolContext.schoolId, code, name, components, applicableFor });
    return successResponse(res, struct, 'Salary structure created', 201);
  } catch (err) { next(err); }
};

// ─── Salary Assignments ──────────────────────────────────
exports.assignSalary = async (req, res, next) => {
  try {
    const { staffId, structureId, effectiveFrom, basicSalary, overrides } = req.body;
    if (!staffId || !structureId || !effectiveFrom || !basicSalary) {
      throw new ValidationError('staffId, structureId, effectiveFrom, basicSalary required');
    }
    // Expire old assignment
    await EmployeeSalaryAssignment.updateMany(
      { staffId, schoolId: req.schoolContext.schoolId, isActive: true },
      { isActive: false, effectiveTo: new Date(effectiveFrom) }
    );
    const assignment = await EmployeeSalaryAssignment.create({
      schoolId: req.schoolContext.schoolId, staffId, structureId, effectiveFrom, basicSalary, overrides,
    });
    await logAudit(req, 'salary_assign', 'EmployeeSalaryAssignment', assignment._id, null, assignment.toObject());
    return successResponse(res, assignment, 'Salary assigned', 201);
  } catch (err) { next(err); }
};

// ─── Payroll Periods ─────────────────────────────────────
exports.listPeriods = async (req, res, next) => {
  try {
    const periods = await PayrollPeriod.find({ schoolId: req.schoolContext.schoolId }).sort({ startDate: -1 }).lean();
    return successResponse(res, periods, 'Payroll periods retrieved');
  } catch (err) { next(err); }
};

exports.createPeriod = async (req, res, next) => {
  try {
    const { name, startDate, endDate, payDate } = req.body;
    if (!name || !startDate || !endDate) throw new ValidationError('name, startDate, endDate required');
    const period = await PayrollPeriod.create({
      schoolId: req.schoolContext.schoolId, name, startDate, endDate, payDate,
      status: 'DRAFT', createdBy: req.user._id,
    });
    return successResponse(res, period, 'Payroll period created', 201);
  } catch (err) { next(err); }
};

// ─── Payroll Processing ──────────────────────────────────
exports.processPayroll = async (req, res, next) => {
  try {
    const period = await PayrollPeriod.findOne({ _id: req.params.periodId, schoolId: req.schoolContext.schoolId });
    if (!period) throw new NotFoundError('Payroll period not found');
    if (period.status === 'LOCKED') throw new ForbiddenError('Payroll period is already locked');

    const staffList = await Staff.find({ schoolId: req.schoolContext.schoolId, isActive: true }).lean();
    const processed = [];

    for (const staff of staffList) {
      const assignment = await EmployeeSalaryAssignment.findOne({
        staffId: staff._id, schoolId: req.schoolContext.schoolId, isActive: true,
      }).populate('structureId').lean();

      if (!assignment) continue;

      const structure = assignment.structureId;
      const basic = assignment.basicSalary;
      let earnings = 0, deductions = 0;
      const breakdown = [];

      for (const comp of (structure?.components || [])) {
        const component = await SalaryComponent.findById(comp.componentId).lean();
        if (!component) continue;
        let amount = 0;
        if (component.calcType === 'FIXED') amount = comp.amount || component.value || 0;
        else if (component.calcType === 'PERCENTAGE') amount = (basic * (comp.percentage || component.value || 0)) / 100;
        breakdown.push({ componentId: component._id, name: component.name, type: component.type, amount });
        if (component.type === 'EARNING') earnings += amount;
        else if (component.type === 'DEDUCTION') deductions += amount;
      }

      // Apply any adjustments
      const adjustments = await PayrollAdjustment.find({
        staffId: staff._id, payrollPeriodId: period._id, status: 'APPROVED',
      }).lean();
      for (const adj of adjustments) {
        if (adj.type === 'BONUS') earnings += adj.amount;
        else if (adj.type === 'DEDUCTION') deductions += adj.amount;
        breakdown.push({ name: adj.reason, type: adj.type, amount: adj.amount });
      }

      const gross = earnings;
      const net = gross - deductions;

      await PayrollEntry.findOneAndUpdate(
        { staffId: staff._id, payrollPeriodId: period._id, schoolId: req.schoolContext.schoolId },
        {
          $set: {
            schoolId: req.schoolContext.schoolId,
            staffId: staff._id,
            payrollPeriodId: period._id,
            salaryAssignmentId: assignment._id,
            breakdown,
            earnings, deductions, gross, net,
            status: 'CALCULATED',
          }
        },
        { upsert: true, new: true }
      );
      processed.push({ staffId: staff._id, net });
    }

    period.status = 'PROCESSED';
    period.processedBy = req.user._id;
    period.processedAt = new Date();
    await period.save();

    await logAudit(req, 'payroll_process', 'PayrollPeriod', period._id, null, { count: processed.length });
    return successResponse(res, { period, processedCount: processed.length }, 'Payroll processed');
  } catch (err) { next(err); }
};

exports.lockPeriod = async (req, res, next) => {
  try {
    const period = await PayrollPeriod.findOne({ _id: req.params.periodId, schoolId: req.schoolContext.schoolId });
    if (!period) throw new NotFoundError('Payroll period not found');
    if (period.status !== 'PROCESSED') throw new ForbiddenError('Only processed payroll can be locked');
    period.status = 'LOCKED';
    period.lockedBy = req.user._id;
    period.lockedAt = new Date();
    await period.save();
    // Generate payslips
    const entries = await PayrollEntry.find({ payrollPeriodId: period._id }).lean();
    for (const entry of entries) {
      await Payslip.findOneAndUpdate(
        { payrollEntryId: entry._id },
        {
          $set: {
            schoolId: period.schoolId,
            staffId: entry.staffId,
            payrollPeriodId: period._id,
            payrollEntryId: entry._id,
            net: entry.net,
            gross: entry.gross,
            earnings: entry.earnings,
            deductions: entry.deductions,
            status: 'GENERATED',
          }
        },
        { upsert: true, new: true }
      );
    }
    await logAudit(req, 'payroll_lock', 'PayrollPeriod', period._id, null, null);
    return successResponse(res, period, 'Payroll locked and payslips generated');
  } catch (err) { next(err); }
};

// GET /api/v1/hr/payroll/payslips/:staffId
exports.getPayslips = async (req, res, next) => {
  try {
    const payslips = await Payslip.find({
      staffId: req.params.staffId,
      schoolId: req.schoolContext.schoolId,
    }).populate('payrollPeriodId', 'name startDate endDate').sort({ createdAt: -1 }).lean();
    return successResponse(res, payslips, 'Payslips retrieved');
  } catch (err) { next(err); }
};

// POST /api/v1/hr/payroll/adjustments
exports.createAdjustment = async (req, res, next) => {
  try {
    const { staffId, payrollPeriodId, type, amount, reason } = req.body;
    if (!staffId || !type || !amount) throw new ValidationError('staffId, type, amount required');
    const adj = await PayrollAdjustment.create({
      schoolId: req.schoolContext.schoolId, staffId, payrollPeriodId, type, amount, reason,
      status: 'PENDING', createdBy: req.user._id,
    });
    return successResponse(res, adj, 'Payroll adjustment created', 201);
  } catch (err) { next(err); }
};
