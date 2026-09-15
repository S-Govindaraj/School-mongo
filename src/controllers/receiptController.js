const Receipt = require('../models/Receipt');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const School = require('../models/School');
const { successResponse, errorResponse } = require('../utils/response');

const getReceipts = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { studentId, search, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId };
    if (studentId) query.studentId = studentId;

    if (search && search.trim()) {
      const s = String(search).trim();
      const matchingStudents = await Student.find({
        schoolId,
        $or: [
          { firstName: { $regex: s, $options: 'i' } },
          { lastName: { $regex: s, $options: 'i' } },
          { admissionNumber: { $regex: s, $options: 'i' } }
        ]
      }).select('_id');

      query.$or = [
        { receiptNumber: { $regex: s, $options: 'i' } },
        { referenceNumber: { $regex: s, $options: 'i' } },
        { studentId: { $in: matchingStudents.map(st => st._id) } }
      ];
    }

    const [receipts, total] = await Promise.all([
      Receipt.find(query)
        .populate('studentId', 'firstName lastName admissionNumber studentNumber')
        .populate('generatedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Receipt.countDocuments(query)
    ]);

    return successResponse(res, receipts, 'Receipts fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

const getReceiptById = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { id } = req.params;

    const receipt = await Receipt.findOne({ _id: id, schoolId })
      .populate('studentId', 'firstName lastName admissionNumber studentNumber phone email')
      .populate('paymentId')
      .populate('generatedBy', 'name email');

    if (!receipt) {
      return errorResponse(res, 'Receipt not found', 404, 'NOT_FOUND');
    }

    const school = await School.findById(schoolId).select('name address logo code phone email');
    const enrollment = await Enrollment.findOne({ schoolId, studentId: receipt.studentId._id, isCurrent: true })
      .populate('gradeId', 'name')
      .populate('sectionId', 'name');

    const result = receipt.toObject();
    result.school = school;
    result.enrollment = enrollment;

    return successResponse(res, result, 'Receipt details fetched successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReceipts,
  getReceiptById
};
