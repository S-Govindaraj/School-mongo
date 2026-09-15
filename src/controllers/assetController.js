/**
 * Phase 8 — Asset Management Controller
 */
const Asset = require('../models/Asset');
const AssetAssignment = require('../models/AssetAssignment');
const AssetMaintenance = require('../models/AssetMaintenance');
const AssetTransfer = require('../models/AssetTransfer');
const AssetDisposal = require('../models/AssetDisposal');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

exports.list = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [total, assets] = await Promise.all([
      Asset.countDocuments(filter),
      Asset.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return successResponse(res, assets, 'Assets retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId }).lean();
    if (!asset) throw new NotFoundError('Asset not found');
    const [assignments, maintenance, transfers] = await Promise.all([
      AssetAssignment.find({ assetId: asset._id }).sort({ createdAt: -1 }).lean(),
      AssetMaintenance.find({ assetId: asset._id }).sort({ createdAt: -1 }).lean(),
      AssetTransfer.find({ assetId: asset._id }).sort({ createdAt: -1 }).lean(),
    ]);
    return successResponse(res, { ...asset, assignments, maintenance, transfers }, 'Asset retrieved');
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { code, name, category, serialNumber, purchaseDate, purchasePrice, vendor, location, warrantyExpiry, depreciationRate } = req.body;
    if (!code || !name) throw new ValidationError('code and name required');
    const asset = await Asset.create({
      schoolId: req.schoolContext.schoolId, code, name, category, serialNumber,
      purchaseDate, purchasePrice, vendor, location, warrantyExpiry, depreciationRate,
      status: 'AVAILABLE', createdBy: req.user._id,
    });
    await logAudit(req, 'asset_create', 'Asset', asset._id, null, asset.toObject());
    return successResponse(res, asset, 'Asset created', 201);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!asset) throw new NotFoundError('Asset not found');
    const before = asset.toObject();
    const allowed = ['name', 'category', 'location', 'status', 'warrantyExpiry', 'depreciationRate', 'notes'];
    allowed.forEach((k) => { if (req.body[k] !== undefined) asset[k] = req.body[k]; });
    await asset.save();
    await logAudit(req, 'asset_update', 'Asset', asset._id, before, asset.toObject());
    return successResponse(res, asset, 'Asset updated');
  } catch (err) { next(err); }
};

exports.assign = async (req, res, next) => {
  try {
    const { assignedTo, assigneeType, assignedDate, notes } = req.body;
    const asset = await Asset.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!asset) throw new NotFoundError('Asset not found');
    if (asset.status === 'DISPOSED') throw new ForbiddenError('Cannot assign a disposed asset');
    // Return previous assignment
    await AssetAssignment.updateMany({ assetId: asset._id, returnedAt: null }, { returnedAt: new Date() });
    const assignment = await AssetAssignment.create({
      schoolId: req.schoolContext.schoolId, assetId: asset._id,
      assignedTo, assigneeType, assignedDate: assignedDate || new Date(), notes,
      assignedBy: req.user._id,
    });
    asset.status = 'ASSIGNED';
    asset.currentAssignee = assignedTo;
    await asset.save();
    await logAudit(req, 'asset_assign', 'AssetAssignment', assignment._id, null, assignment.toObject());
    return successResponse(res, assignment, 'Asset assigned', 201);
  } catch (err) { next(err); }
};

exports.scheduleMaintenance = async (req, res, next) => {
  try {
    const { scheduledDate, type, description, vendor, estimatedCost } = req.body;
    const asset = await Asset.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!asset) throw new NotFoundError('Asset not found');
    const maint = await AssetMaintenance.create({
      schoolId: req.schoolContext.schoolId, assetId: asset._id,
      scheduledDate, type, description, vendor, estimatedCost,
      status: 'SCHEDULED', scheduledBy: req.user._id,
    });
    return successResponse(res, maint, 'Maintenance scheduled', 201);
  } catch (err) { next(err); }
};

exports.dispose = async (req, res, next) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!asset) throw new NotFoundError('Asset not found');
    if (asset.status === 'DISPOSED') throw new ForbiddenError('Asset already disposed');
    const { disposalDate, method, salePrice, remarks } = req.body;
    const disposal = await AssetDisposal.create({
      schoolId: req.schoolContext.schoolId, assetId: asset._id,
      disposalDate: disposalDate || new Date(), method, salePrice, remarks,
      disposedBy: req.user._id,
    });
    asset.status = 'DISPOSED';
    asset.disposedAt = new Date();
    await asset.save();
    await logAudit(req, 'asset_dispose', 'AssetDisposal', disposal._id, null, disposal.toObject());
    return successResponse(res, disposal, 'Asset disposed');
  } catch (err) { next(err); }
};
