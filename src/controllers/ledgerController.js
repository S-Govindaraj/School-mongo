const StudentLedger = require('../models/StudentLedger');
const Student = require('../models/Student');
const { successResponse, errorResponse } = require('../utils/response');

const getStudentLedger = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const {
      studentId,
      academicYearId,
      referenceType,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const query = { schoolId };
    if (studentId) query.studentId = studentId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (referenceType && referenceType !== 'ALL') query.referenceType = referenceType;

    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) query.transactionDate.$gte = new Date(startDate);
      if (endDate) query.transactionDate.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [entries, total] = await Promise.all([
      StudentLedger.find(query)
        .populate('studentId', 'firstName lastName admissionNumber studentNumber')
        .populate('createdBy', 'name email')
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      StudentLedger.countDocuments(query)
    ]);

    // Current net balance for student if studentId is provided
    let currentBalance = 0;
    if (studentId) {
      const lastLedger = await StudentLedger.findOne({ schoolId, studentId })
        .sort({ transactionDate: -1, createdAt: -1 });
      if (lastLedger) currentBalance = lastLedger.balance;
    }

    return successResponse(res, {
      entries,
      currentBalance
    }, 'Student ledger fetched successfully', 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStudentLedger
};
