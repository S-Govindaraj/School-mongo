const ClassSubject = require('../models/ClassSubject');
const AcademicYear = require('../models/AcademicYear');
const Grade = require('../models/Grade');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const Timetable = require('../models/Timetable');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const validateClassSubjectData = async (schoolId, data, currentId = null) => {
  const {
    academicYearId,
    gradeId,
    subjectId,
    passMarks = 35,
    maxMarks = 100,
    theoryMarks,
    practicalMarks,
    weeklyPeriods = 5,
    isMandatory = true,
    isElective = false,
    subjectGroup = '',
  } = data;

  // Relationship validation
  const [year, grade, subject] = await Promise.all([
    AcademicYear.findOne({ _id: academicYearId, schoolId }),
    Grade.findOne({ _id: gradeId, schoolId }),
    Subject.findOne({ _id: subjectId, schoolId }),
  ]);

  if (!year) throw new ValidationError('Selected academic year does not exist in this school.');
  if (!grade) throw new ValidationError('Selected grade does not exist in this school.');
  if (!subject) throw new ValidationError('Selected subject does not exist in this school.');

  // Marks validation
  const numMax = Number(maxMarks);
  const numPass = Number(passMarks);
  if (numMax <= 0) throw new ValidationError('Max marks must be greater than 0.');
  if (numPass < 0) throw new ValidationError('Pass marks cannot be negative.');
  if (numPass > numMax) throw new ValidationError('Pass marks cannot exceed max marks.');

  if (theoryMarks !== undefined && practicalMarks !== undefined) {
    const numTheory = Number(theoryMarks);
    const numPractical = Number(practicalMarks);
    if (numTheory + numPractical !== numMax) {
      throw new ValidationError(`Theory marks (${numTheory}) and practical marks (${numPractical}) must equal max marks (${numMax}).`);
    }
  }

  // Weekly periods validation
  const numPeriods = Number(weeklyPeriods);
  if (!Number.isInteger(numPeriods) || numPeriods <= 0 || numPeriods > 50) {
    throw new ValidationError('Weekly periods must be a positive integer between 1 and 50.');
  }

  // Elective vs Mandatory validation
  if (isElective && (!subjectGroup || !String(subjectGroup).trim())) {
    throw new ValidationError('Elective subjects must specify an elective group.');
  }

  // Duplicate relationship check
  const duplicateQuery = {
    schoolId,
    academicYearId,
    gradeId,
    subjectId,
    status: { $ne: 'ARCHIVED' },
  };
  if (currentId) duplicateQuery._id = { $ne: currentId };

  const existing = await ClassSubject.findOne(duplicateQuery);
  if (existing) {
    throw new ValidationError('This subject is already configured for the selected academic year and grade.');
  }
};

const getClassSubjects = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { academicYearId, gradeId, status, includeArchived } = req.query;

    const filter = { schoolId };
    if (status && status !== 'ALL') {
      filter.status = status;
    } else if (includeArchived === 'false') {
      filter.status = { $ne: 'ARCHIVED' };
    }
    if (academicYearId) filter.academicYearId = academicYearId;
    if (gradeId) filter.gradeId = gradeId;

    const list = await ClassSubject.find(filter)
      .populate('gradeId')
      .populate('subjectId')
      .populate('academicYearId')
      .sort({ createdAt: -1 });

    return successResponse(res, list, 'Class subjects retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createClassSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    await validateClassSubjectData(schoolId, req.body);

    const {
      academicYearId,
      gradeId,
      subjectId,
      isMandatory = true,
      isElective = false,
      subjectGroup = '',
      weeklyPeriods = 5,
      passMarks = 35,
      maxMarks = 100,
      theoryMarks,
      practicalMarks,
      status: requestedStatus,
    } = req.body;

    const status = requestedStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';

    const record = await ClassSubject.create({
      schoolId,
      academicYearId,
      gradeId,
      subjectId,
      isMandatory: Boolean(isMandatory),
      isElective: Boolean(isElective),
      subjectGroup: String(subjectGroup || '').trim(),
      weeklyPeriods: Number(weeklyPeriods),
      passMarks: Number(passMarks),
      maxMarks: Number(maxMarks),
      theoryMarks: theoryMarks !== undefined ? Number(theoryMarks) : undefined,
      practicalMarks: practicalMarks !== undefined ? Number(practicalMarks) : undefined,
      status,
    });

    const populated = await ClassSubject.findById(record._id)
      .populate('gradeId')
      .populate('subjectId')
      .populate('academicYearId');

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'CREATE',
      entity: 'ClassSubject',
      entityId: record._id.toString(),
      newValues: record.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, populated, 'Class subject configured successfully', 201);
  } catch (error) {
    next(error);
  }
};

const saveBulkClassSubjects = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { items = [] } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('At least one class subject item is required.');
    }

    const createdRecords = [];
    for (const item of items) {
      await validateClassSubjectData(schoolId, item);
      const {
        academicYearId,
        gradeId,
        subjectId,
        isMandatory = true,
        isElective = false,
        subjectGroup = '',
        weeklyPeriods = 5,
        passMarks = 35,
        maxMarks = 100,
        theoryMarks,
        practicalMarks,
      } = item;

      let record = await ClassSubject.findOne({ schoolId, academicYearId, gradeId, subjectId });
      if (!record) {
        record = await ClassSubject.create({
          schoolId,
          academicYearId,
          gradeId,
          subjectId,
          isMandatory: Boolean(isMandatory),
          isElective: Boolean(isElective),
          subjectGroup: String(subjectGroup || '').trim(),
          weeklyPeriods: Number(weeklyPeriods),
          passMarks: Number(passMarks),
          maxMarks: Number(maxMarks),
          theoryMarks: theoryMarks !== undefined ? Number(theoryMarks) : undefined,
          practicalMarks: practicalMarks !== undefined ? Number(practicalMarks) : undefined,
          status: 'ACTIVE',
        });
      } else {
        record.isMandatory = Boolean(isMandatory);
        record.isElective = Boolean(isElective);
        record.subjectGroup = String(subjectGroup || '').trim();
        record.weeklyPeriods = Number(weeklyPeriods);
        record.passMarks = Number(passMarks);
        record.maxMarks = Number(maxMarks);
        record.theoryMarks = theoryMarks !== undefined ? Number(theoryMarks) : undefined;
        record.practicalMarks = practicalMarks !== undefined ? Number(practicalMarks) : undefined;
        record.status = 'ACTIVE';
        await record.save();
      }
      createdRecords.push(record);
    }

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'BULK_CREATE',
      entity: 'ClassSubject',
      details: { count: createdRecords.length },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, createdRecords, 'Bulk class subjects saved successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateClassSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const record = await ClassSubject.findOne({ _id: id, schoolId });
    if (!record) {
      throw new NotFoundError('Class subject configuration not found.');
    }

    const oldValues = record.toObject();
    const merged = { ...record.toObject(), ...req.body };
    await validateClassSubjectData(schoolId, merged, id);

    Object.assign(record, req.body);
    await record.save();

    const populated = await ClassSubject.findById(record._id)
      .populate('gradeId')
      .populate('subjectId')
      .populate('academicYearId');

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'UPDATE',
      entity: 'ClassSubject',
      entityId: record._id.toString(),
      oldValues,
      newValues: record.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, populated, 'Class subject updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteClassSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const record = await ClassSubject.findOne({ _id: id, schoolId });
    if (!record) {
      throw new NotFoundError('Class subject configuration not found.');
    }

    const [hasAssignments, hasTimetable] = await Promise.all([
      TeacherAssignment.countDocuments({
        schoolId,
        academicYearId: record.academicYearId,
        gradeId: record.gradeId,
        subjectId: record.subjectId,
        status: { $ne: 'ARCHIVED' },
      }),
      Timetable.countDocuments({
        schoolId,
        academicYearId: record.academicYearId,
        gradeId: record.gradeId,
        subjectId: record.subjectId,
        status: { $ne: 'ARCHIVED' },
      }),
    ]);

    if (hasAssignments > 0 || hasTimetable > 0) {
      throw new ValidationError(
        'This class subject configuration cannot be deleted because active teacher assignments or timetable entries reference it.'
      );
    }

    record.status = 'INACTIVE';
    await record.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'DEACTIVATE',
      entity: 'ClassSubject',
      entityId: id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Class subject configuration deactivated successfully');
  } catch (error) {
    next(error);
  }
};

const restoreClassSubject = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const record = await ClassSubject.findOne({ _id: id, schoolId });
    if (!record) {
      throw new NotFoundError('Class subject configuration not found.');
    }

    record.status = 'ACTIVE';
    await record.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user?._id,
      actorName: req.user?.name,
      actorEmail: req.user?.email,
      action: 'ACTIVATE',
      entity: 'ClassSubject',
      entityId: record._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, record, 'Class subject activated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getClassSubjects,
  createClassSubject,
  saveBulkClassSubjects,
  createBulkClassSubjects: saveBulkClassSubjects,
  updateClassSubject,
  deleteClassSubject,
  restoreClassSubject,
};
