/**
 * Phase 8 — Employment Profile Controller (HRMS)
 * Manages employee HR records linked to Staff.
 */
const EmploymentProfile = require('../models/EmploymentProfile');
const EmployeeHistory = require('../models/EmployeeHistory');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

exports.list = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.designationId) filter.designationId = req.query.designationId;
    if (req.query.employmentStatus) filter.employmentStatus = req.query.employmentStatus;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const [total, profiles] = await Promise.all([
      EmploymentProfile.countDocuments(filter),
      EmploymentProfile.find(filter)
        .populate('staffId', 'firstName lastName employeeId')
        .populate('departmentId', 'name')
        .populate('designationId', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    return successResponse(res, profiles, 'Employment profiles retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const profile = await EmploymentProfile.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId })
      .populate('staffId', 'firstName lastName employeeId email phone')
      .populate('departmentId', 'name code')
      .populate('designationId', 'name level')
      .lean();
    if (!profile) throw new NotFoundError('Employment profile not found');
    const history = await EmployeeHistory.find({ employmentProfileId: profile._id }).sort({ changedAt: -1 }).lean();
    return successResponse(res, { ...profile, history }, 'Employment profile retrieved');
  } catch (err) { next(err); }
};

exports.getByStaff = async (req, res, next) => {
  try {
    const profile = await EmploymentProfile.findOne({
      staffId: req.params.staffId,
      schoolId: req.schoolContext.schoolId,
    })
      .populate('departmentId', 'name code')
      .populate('designationId', 'name level')
      .lean();
    if (!profile) throw new NotFoundError('Employment profile not found');
    return successResponse(res, profile, 'Employment profile retrieved');
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { staffId, departmentId, designationId, employmentType, joinDate, probationEndDate, reportingTo, employeeCategoryId } = req.body;
    if (!staffId || !departmentId || !designationId) throw new ValidationError('staffId, departmentId, designationId are required');
    const profile = await EmploymentProfile.create({
      schoolId: req.schoolContext.schoolId,
      staffId, departmentId, designationId, employmentType, joinDate, probationEndDate,
      reportingTo, employeeCategoryId, createdBy: req.user._id,
    });
    await logAudit(req, 'employment_profile_create', 'EmploymentProfile', profile._id, null, profile.toObject());
    return successResponse(res, profile, 'Employment profile created', 201);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const profile = await EmploymentProfile.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!profile) throw new NotFoundError('Employment profile not found');
    const before = profile.toObject();
    const allowed = [
      'departmentId', 'designationId', 'employmentType', 'employmentStatus',
      'probationEndDate', 'reportingTo', 'employeeCategoryId', 'separationDate',
      'separationType', 'separationReason', 'pfNumber', 'esiNumber', 'panNumber', 'bankAccount',
    ];
    allowed.forEach((k) => { if (req.body[k] !== undefined) profile[k] = req.body[k]; });
    await profile.save();

    // Record history entry if department/designation changed
    if (before.departmentId?.toString() !== profile.departmentId?.toString() ||
        before.designationId?.toString() !== profile.designationId?.toString()) {
      await EmployeeHistory.create({
        schoolId: req.schoolContext.schoolId,
        employmentProfileId: profile._id,
        changeType: 'TRANSFER',
        previousValues: { departmentId: before.departmentId, designationId: before.designationId },
        newValues: { departmentId: profile.departmentId, designationId: profile.designationId },
        effectiveDate: new Date(),
        changedBy: req.user._id,
      });
    }

    await logAudit(req, 'employment_profile_update', 'EmploymentProfile', profile._id, before, profile.toObject());
    return successResponse(res, profile, 'Employment profile updated');
  } catch (err) { next(err); }
};
