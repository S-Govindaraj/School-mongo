const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const AcademicYear = require('../models/AcademicYear');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const AcademicHistory = require('../models/AcademicHistory');
const Admission = require('../models/Admission');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getEnrollments = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId = '', academicYearId = '', gradeId = '', sectionId = '', page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = { schoolId, status: { $ne: 'ARCHIVED' } };
    if (studentId) query.studentId = studentId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (gradeId) query.gradeId = gradeId;
    if (sectionId) query.sectionId = sectionId;

    const [totalRecords, enrollments] = await Promise.all([
      Enrollment.countDocuments(query),
      Enrollment.find(query)
        .populate('studentId', 'firstName lastName studentNumber admissionNumber status email phone')
        .populate('academicYearId', 'name code')
        .populate('gradeId', 'name code')
        .populate('sectionId', 'name code room')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    const formattedEnrollments = enrollments.map((e) => ({
      ...e,
      id: String(e._id),
    }));

    return res.status(200).json({
      success: true,
      data: formattedEnrollments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createEnrollment = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { studentId, academicYearId, gradeId, sectionId } = req.body;

    // 1. Verify student exists and belongs to school
    const student = await Student.findOne({ _id: studentId, schoolId });
    if (!student) throw new NotFoundError('Student profile not found');

    // 2. Verify academic year exists
    const ay = await AcademicYear.findOne({ _id: academicYearId, schoolId });
    if (!ay) throw new ValidationError('Invalid Academic Year');

    // 3. Verify grade exists
    const grade = await Grade.findOne({ _id: gradeId, schoolId });
    if (!grade) throw new ValidationError('Invalid Grade');

    // 4. Verify section belongs to grade and school
    const section = await Section.findOne({ _id: sectionId, gradeId, schoolId });
    if (!section) throw new ValidationError('Invalid Section for the selected Grade');

    // 5. Deactivate previous active enrollment for this student in this academic year
    await Enrollment.updateMany(
      { schoolId, studentId, academicYearId, isCurrent: true },
      { isCurrent: false, status: 'PROMOTED' }
    );

    // 6. Create active enrollment
    const enrollment = await Enrollment.create({
      schoolId,
      studentId,
      academicYearId,
      gradeId,
      sectionId,
      status: 'ENROLLED',
      isCurrent: true,
    });

    // 7. Update Student status to ACTIVE
    student.status = 'ACTIVE';
    await student.save();

    // 8. Update admission status if application exists
    await Admission.updateOne(
      { schoolId, studentId, status: 'ADMITTED' },
      { status: 'ENROLLED' }
    );

    // 9. Write to immutable AcademicHistory
    await AcademicHistory.create({
      schoolId,
      studentId,
      academicYearId,
      gradeId,
      sectionId,
      enrollmentId: enrollment._id,
      promotionStatus: 'ENROLLED',
      remarks: `Enrolled in ${grade.name} - Section ${section.name} for ${ay.name}`,
    });

    await logAuditEvent(req, 'ENROLL', 'ENROLLMENT', enrollment._id, null, enrollment);
    return successResponse(res, enrollment, 'Student enrolled successfully', 201);
  } catch (error) {
    next(error);
  }
};

const promoteStudent = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;
    const { targetAcademicYearId, targetGradeId, targetSectionId, promotionStatus = 'PROMOTED', remarks = '' } = req.body;

    const currentEnrollment = await Enrollment.findOne({ _id: id, schoolId });
    if (!currentEnrollment) throw new NotFoundError('Current enrollment record not found');

    const [targetAY, targetGrade, targetSection] = await Promise.all([
      AcademicYear.findOne({ _id: targetAcademicYearId, schoolId }),
      Grade.findOne({ _id: targetGradeId, schoolId }),
      Section.findOne({ _id: targetSectionId, gradeId: targetGradeId, schoolId }),
    ]);

    if (!targetAY) throw new ValidationError('Invalid target Academic Year');
    if (!targetGrade) throw new ValidationError('Invalid target Grade');
    if (!targetSection) throw new ValidationError('Invalid target Section');

    // Mark current enrollment as historical
    currentEnrollment.isCurrent = false;
    currentEnrollment.status = promotionStatus;
    await currentEnrollment.save();

    // Create new enrollment
    const newEnrollment = await Enrollment.create({
      schoolId,
      studentId: currentEnrollment.studentId,
      academicYearId: targetAcademicYearId,
      gradeId: targetGradeId,
      sectionId: targetSectionId,
      status: 'ENROLLED',
      isCurrent: true,
    });

    // Write to AcademicHistory
    await AcademicHistory.create({
      schoolId,
      studentId: currentEnrollment.studentId,
      academicYearId: targetAcademicYearId,
      gradeId: targetGradeId,
      sectionId: targetSectionId,
      enrollmentId: newEnrollment._id,
      promotionStatus,
      remarks: remarks || `Promoted to ${targetGrade.name} - ${targetSection.name}`,
    });

    await logAuditEvent(req, 'PROMOTE', 'ENROLLMENT', newEnrollment._id, null, { previousEnrollmentId: id });
    return successResponse(res, newEnrollment, 'Student promoted/re-enrolled successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEnrollments,
  createEnrollment,
  promoteStudent,
  promoteStudents: promoteStudent,
};
