/**
 * Phase 8 — Inventory & Procurement Controller
 */
const InventoryCategory = require('../models/InventoryCategory');
const InventoryItem = require('../models/InventoryItem');
const Warehouse = require('../models/Warehouse');
const Stock = require('../models/Stock');
const StockMovement = require('../models/StockMovement');
const Vendor = require('../models/Vendor');
const PurchaseRequest = require('../models/PurchaseRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { logAudit } = require('../middleware/auditLogger');

// ─── Categories ──────────────────────────────────────────
exports.listCategories = async (req, res, next) => {
  try {
    const cats = await InventoryCategory.find({ schoolId: req.schoolContext.schoolId }).lean();
    return successResponse(res, cats, 'Categories retrieved');
  } catch (err) { next(err); }
};

exports.createCategory = async (req, res, next) => {
  try {
    const { code, name, description, parentId } = req.body;
    if (!code || !name) throw new ValidationError('code and name required');
    const cat = await InventoryCategory.create({ schoolId: req.schoolContext.schoolId, code, name, description, parentId });
    return successResponse(res, cat, 'Category created', 201);
  } catch (err) { next(err); }
};

// ─── Items ───────────────────────────────────────────────
exports.listItems = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.categoryId) filter.categoryId = req.query.categoryId;
    if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [total, items] = await Promise.all([
      InventoryItem.countDocuments(filter),
      InventoryItem.find(filter).populate('categoryId', 'name').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return successResponse(res, items, 'Items retrieved', 200, { total, page, limit });
  } catch (err) { next(err); }
};

exports.createItem = async (req, res, next) => {
  try {
    const { code, name, categoryId, unit, unitPrice, minStock, description } = req.body;
    if (!code || !name) throw new ValidationError('code and name required');
    const item = await InventoryItem.create({
      schoolId: req.schoolContext.schoolId, code, name, categoryId, unit, unitPrice, minStock, description
    });
    return successResponse(res, item, 'Item created', 201);
  } catch (err) { next(err); }
};

// ─── Warehouses ──────────────────────────────────────────
exports.listWarehouses = async (req, res, next) => {
  try {
    const wh = await Warehouse.find({ schoolId: req.schoolContext.schoolId }).lean();
    return successResponse(res, wh, 'Warehouses retrieved');
  } catch (err) { next(err); }
};

exports.createWarehouse = async (req, res, next) => {
  try {
    const { code, name, location, keeper } = req.body;
    if (!code || !name) throw new ValidationError('code and name required');
    const wh = await Warehouse.create({ schoolId: req.schoolContext.schoolId, code, name, location, keeper });
    return successResponse(res, wh, 'Warehouse created', 201);
  } catch (err) { next(err); }
};

// ─── Stock ───────────────────────────────────────────────
exports.getStock = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId;
    if (req.query.itemId) filter.itemId = req.query.itemId;
    const stocks = await Stock.find(filter)
      .populate('itemId', 'name code unit unitPrice minStock')
      .populate('warehouseId', 'name code').lean();
    return successResponse(res, stocks, 'Stock retrieved');
  } catch (err) { next(err); }
};

exports.adjustStock = async (req, res, next) => {
  try {
    const { itemId, warehouseId, quantity, movementType, reference, reason } = req.body;
    if (!itemId || !warehouseId || !quantity || !movementType) {
      throw new ValidationError('itemId, warehouseId, quantity, movementType required');
    }
    const existing = await Stock.findOne({ itemId, warehouseId, schoolId: req.schoolContext.schoolId });
    const before = existing ? existing.quantity : 0;
    let after;
    if (movementType === 'IN') after = before + quantity;
    else if (movementType === 'OUT') {
      if (before < quantity) throw new ForbiddenError('Insufficient stock');
      after = before - quantity;
    } else after = quantity; // ADJUSTMENT

    await Stock.findOneAndUpdate(
      { itemId, warehouseId, schoolId: req.schoolContext.schoolId },
      { $set: { quantity: after, lastUpdated: new Date() } },
      { upsert: true }
    );
    const movement = await StockMovement.create({
      schoolId: req.schoolContext.schoolId, itemId, warehouseId,
      movementType, quantity, beforeQty: before, afterQty: after, reference, reason,
      createdBy: req.user._id,
    });
    await logAudit(req, 'stock_adjust', 'Stock', itemId, { qty: before }, { qty: after });
    return successResponse(res, { stock: { quantity: after }, movement }, 'Stock adjusted');
  } catch (err) { next(err); }
};

// ─── Vendors ─────────────────────────────────────────────
exports.listVendors = async (req, res, next) => {
  try {
    const vendors = await Vendor.find({ schoolId: req.schoolContext.schoolId }).lean();
    return successResponse(res, vendors, 'Vendors retrieved');
  } catch (err) { next(err); }
};

exports.createVendor = async (req, res, next) => {
  try {
    const { code, name, contact, email, phone, address, gstNumber, panNumber, bankDetails } = req.body;
    if (!code || !name) throw new ValidationError('code and name required');
    const vendor = await Vendor.create({ schoolId: req.schoolContext.schoolId, code, name, contact, email, phone, address, gstNumber, panNumber, bankDetails });
    return successResponse(res, vendor, 'Vendor created', 201);
  } catch (err) { next(err); }
};

// ─── Purchase Requests ───────────────────────────────────
exports.listPRs = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.status) filter.status = req.query.status;
    const prs = await PurchaseRequest.find(filter)
      .populate('requestedBy', 'firstName lastName').sort({ createdAt: -1 }).lean();
    return successResponse(res, prs, 'Purchase requests retrieved');
  } catch (err) { next(err); }
};

exports.createPR = async (req, res, next) => {
  try {
    const { items, requiredBy, purpose, priority } = req.body;
    if (!items?.length) throw new ValidationError('items[] required');
    const pr = await PurchaseRequest.create({
      schoolId: req.schoolContext.schoolId, items, requiredBy, purpose, priority,
      requestedBy: req.user._id, status: 'PENDING',
    });
    await logAudit(req, 'pr_create', 'PurchaseRequest', pr._id, null, pr.toObject());
    return successResponse(res, pr, 'Purchase request created', 201);
  } catch (err) { next(err); }
};

exports.approvePR = async (req, res, next) => {
  try {
    const pr = await PurchaseRequest.findOne({ _id: req.params.id, schoolId: req.schoolContext.schoolId });
    if (!pr) throw new NotFoundError('Purchase request not found');
    if (pr.status !== 'PENDING') throw new ForbiddenError(`Cannot approve a ${pr.status} request`);
    pr.status = req.body.status; // 'APPROVED' or 'REJECTED'
    pr.approvedBy = req.user._id;
    pr.approvedAt = new Date();
    pr.approvalRemarks = req.body.remarks;
    await pr.save();
    await logAudit(req, `pr_${pr.status.toLowerCase()}`, 'PurchaseRequest', pr._id, null, null);
    return successResponse(res, pr, `Purchase request ${pr.status.toLowerCase()}`);
  } catch (err) { next(err); }
};

// ─── Purchase Orders ─────────────────────────────────────
exports.listPOs = async (req, res, next) => {
  try {
    const filter = { schoolId: req.schoolContext.schoolId };
    if (req.query.status) filter.status = req.query.status;
    const pos = await PurchaseOrder.find(filter)
      .populate('vendorId', 'name code').sort({ createdAt: -1 }).lean();
    return successResponse(res, pos, 'Purchase orders retrieved');
  } catch (err) { next(err); }
};

exports.createPO = async (req, res, next) => {
  try {
    const { purchaseRequestId, vendorId, items, deliveryDate, termsAndConditions, notes } = req.body;
    if (!vendorId || !items?.length) throw new ValidationError('vendorId and items[] required');
    const totalAmount = items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0);
    const po = await PurchaseOrder.create({
      schoolId: req.schoolContext.schoolId, purchaseRequestId, vendorId, items,
      deliveryDate, termsAndConditions, notes, totalAmount,
      status: 'DRAFT', createdBy: req.user._id,
    });
    await logAudit(req, 'po_create', 'PurchaseOrder', po._id, null, po.toObject());
    return successResponse(res, po, 'Purchase order created', 201);
  } catch (err) { next(err); }
};

// ─── Goods Receipt ───────────────────────────────────────
exports.receiveGoods = async (req, res, next) => {
  try {
    const { purchaseOrderId, warehouseId, receivedItems, notes } = req.body;
    if (!purchaseOrderId || !warehouseId || !receivedItems?.length) {
      throw new ValidationError('purchaseOrderId, warehouseId, receivedItems[] required');
    }
    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, schoolId: req.schoolContext.schoolId });
    if (!po) throw new NotFoundError('Purchase order not found');

    const grn = await GoodsReceipt.create({
      schoolId: req.schoolContext.schoolId, purchaseOrderId, warehouseId,
      receivedItems, notes, receivedBy: req.user._id,
    });

    // Update stock for each received item
    for (const ri of receivedItems) {
      const qty = ri.quantityReceived;
      const existing = await Stock.findOne({ itemId: ri.itemId, warehouseId, schoolId: req.schoolContext.schoolId });
      const before = existing ? existing.quantity : 0;
      await Stock.findOneAndUpdate(
        { itemId: ri.itemId, warehouseId, schoolId: req.schoolContext.schoolId },
        { $inc: { quantity: qty }, $set: { lastUpdated: new Date() } },
        { upsert: true }
      );
      await StockMovement.create({
        schoolId: req.schoolContext.schoolId,
        itemId: ri.itemId, warehouseId,
        movementType: 'IN', quantity: qty,
        beforeQty: before, afterQty: before + qty,
        reference: grn._id.toString(), reason: 'Goods Receipt',
        createdBy: req.user._id,
      });
    }

    po.status = 'RECEIVED';
    await po.save();
    await logAudit(req, 'goods_receive', 'GoodsReceipt', grn._id, null, grn.toObject());
    return successResponse(res, grn, 'Goods received and stock updated', 201);
  } catch (err) { next(err); }
};
