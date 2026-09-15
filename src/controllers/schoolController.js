const School = require('../models/School');
const Campus = require('../models/Campus');
const { successResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');

const getSchoolProfile = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    let school;

    if (schoolId) {
      school = await School.findById(schoolId);
    }
    if (!school) {
      school = await School.findOne({});
    }

    if (!school) {
      throw new NotFoundError('School profile not found.');
    }

    return successResponse(res, school, 'School profile retrieved');
  } catch (error) {
    next(error);
  }
};

const updateSchoolProfile = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId || req.user?.schoolId;
    let school;

    if (schoolId) {
      school = await School.findById(schoolId);
    } else {
      school = await School.findOne({});
    }

    if (!school) {
      school = await School.create({
        ...req.body,
        code: req.body.code || 'SCH-001',
      });
    } else {
      const oldValues = school.toObject();
      Object.assign(school, req.body);
      await school.save();

      await logAuditEvent({
        schoolId: school._id,
        actorId: req.user._id,
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'UPDATE',
        entity: 'School',
        entityId: school._id.toString(),
        oldValues,
        newValues: school.toObject(),
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    return successResponse(res, school, 'School profile updated');
  } catch (error) {
    next(error);
  }
};

const getCampuses = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const campuses = await Campus.find({
      schoolId,
      status: { $ne: 'ARCHIVED' },
    }).sort({ isMain: -1, name: 1 });

    return successResponse(res, campuses, 'Campuses retrieved');
  } catch (error) {
    next(error);
  }
};

const createCampus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    if (!schoolId) {
      throw new ValidationError('School context missing.');
    }

    const { name, code, address, phone, email, isMain } = req.body;

    if (isMain) {
      await Campus.updateMany({ schoolId }, { isMain: false });
    }

    const campus = await Campus.create({
      schoolId,
      name,
      code: String(code || '').trim().toUpperCase(),
      address: address || '',
      phone: phone || '',
      email: email || '',
      isMain: Boolean(isMain),
      status: 'ACTIVE',
    });

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CREATE',
      entity: 'Campus',
      entityId: campus._id.toString(),
      newValues: campus.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, campus, 'Campus created', 201);
  } catch (error) {
    next(error);
  }
};

const updateCampus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const campus = await Campus.findOne({ _id: id, schoolId });
    if (!campus) {
      throw new NotFoundError('Campus not found.');
    }

    const oldValues = campus.toObject();

    if (req.body.isMain && !campus.isMain) {
      await Campus.updateMany({ schoolId }, { isMain: false });
    }

    Object.assign(campus, req.body);
    await campus.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'UPDATE',
      entity: 'Campus',
      entityId: campus._id.toString(),
      oldValues,
      newValues: campus.toObject(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, campus, 'Campus updated');
  } catch (error) {
    next(error);
  }
};

const deleteCampus = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext?.schoolId;
    const { id } = req.params;

    const campus = await Campus.findOne({ _id: id, schoolId });
    if (!campus) {
      throw new NotFoundError('Campus not found.');
    }

    if (campus.isMain) {
      throw new ValidationError('Main campus cannot be archived or deleted. Set another campus as main campus first.');
    }

    campus.status = 'ARCHIVED';
    await campus.save();

    await logAuditEvent({
      schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'ARCHIVE',
      entity: 'Campus',
      entityId: campus._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Campus archived successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSchoolProfile,
  updateSchoolProfile,
  getCampuses,
  createCampus,
  updateCampus,
  deleteCampus,
};
