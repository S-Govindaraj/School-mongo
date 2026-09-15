const Document = require('../models/Document');
const DocumentVersion = require('../models/DocumentVersion');
const localStorageProvider = require('../shared/storage/LocalStorageProvider');

const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({
    success: true,
    data,
    meta: { requestId: res.req?.requestId || res.req?.id || 'req_' + Date.now() },
  });
};

exports.getDashboard = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const now = new Date();
    const next30Days = new Date(Date.now() + 30 * 86400000);

    const [
      totalDocuments,
      pendingVerification,
      verifiedDocuments,
      expiringIn30Days,
      expiredDocuments
    ] = await Promise.all([
      Document.countDocuments({ schoolId }),
      Document.countDocuments({ schoolId, status: 'PENDING_VERIFICATION' }),
      Document.countDocuments({ schoolId, status: 'VERIFIED' }),
      Document.countDocuments({ schoolId, expiresAt: { $gte: now, $lte: next30Days } }),
      Document.countDocuments({ schoolId, expiresAt: { $lt: now } })
    ]);

    const verificationQueue = await Document.find({ schoolId, status: 'PENDING_VERIFICATION' })
      .limit(10)
      .sort({ createdAt: 1 });

    sendSuccess(res, {
      summary: {
        totalDocuments,
        pendingVerification,
        verifiedDocuments,
        expiringIn30Days,
        expiredDocuments
      },
      verificationQueue
    });
  } catch (err) {
    next(err);
  }
};

exports.getDocuments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { ownerType, ownerId, documentType, status } = req.query;
    const filter = { schoolId };
    if (ownerType) filter.ownerType = ownerType;
    if (ownerId) filter.ownerId = ownerId;
    if (documentType) filter.documentType = documentType;
    if (status) filter.status = status;

    const documents = await Document.find(filter).sort({ createdAt: -1 });
    sendSuccess(res, documents);
  } catch (err) {
    next(err);
  }
};

exports.uploadDocument = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { ownerType, ownerId, documentType, title, metadata, expiresAt } = req.body;

    // Default metadata file simulation if no file buffer attached
    const fileName = req.file?.originalname || req.body.fileName || `${documentType}_${Date.now()}.pdf`;
    const buffer = req.file?.buffer || Buffer.from(`Document Content: ${title}`);
    const mimeType = req.file?.mimetype || req.body.mimeType || 'application/pdf';

    const uploadResult = await localStorageProvider.uploadFile({
      buffer,
      fileName,
      mimeType,
      schoolId
    });

    const doc = await Document.create({
      schoolId,
      ownerType: ownerType || 'SCHOOL',
      ownerId: ownerId || schoolId,
      documentType: documentType || 'OTHER',
      title: title || fileName,
      fileName,
      originalFileName: fileName,
      mimeType,
      size: uploadResult.size,
      storageKey: uploadResult.storageKey,
      storageProvider: uploadResult.storageProvider,
      checksum: uploadResult.checksum,
      version: 1,
      status: 'PENDING_VERIFICATION',
      uploadedBy: req.user?._id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      metadata: metadata || {}
    });

    await DocumentVersion.create({
      schoolId,
      documentId: doc._id,
      version: 1,
      fileName,
      storageKey: uploadResult.storageKey,
      size: uploadResult.size,
      mimeType,
      checksum: uploadResult.checksum,
      uploadedBy: req.user?._id
    });

    sendSuccess(res, doc, 201);
  } catch (err) {
    next(err);
  }
};

exports.verifyDocument = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, schoolId },
      {
        status: 'VERIFIED',
        verifiedBy: req.user?._id,
        verifiedAt: new Date()
      },
      { new: true }
    );
    sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
};

exports.rejectDocument = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { reason } = req.body;
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, schoolId },
      {
        status: 'REJECTED',
        rejectionReason: reason || 'Document failed verification criteria'
      },
      { new: true }
    );
    sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
};

exports.archiveDocument = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, schoolId },
      { status: 'ARCHIVED' },
      { new: true }
    );
    sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
};

exports.getDocumentVersions = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const versions = await DocumentVersion.find({ schoolId, documentId: req.params.id }).sort({ version: -1 });
    sendSuccess(res, versions);
  } catch (err) {
    next(err);
  }
};

exports.getStudentDocuments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const documents = await Document.find({ schoolId, ownerId: req.params.studentId }).sort({ createdAt: -1 });
    sendSuccess(res, documents);
  } catch (err) {
    next(err);
  }
};

exports.deleteDocument = exports.archiveDocument;
