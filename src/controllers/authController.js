const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const School = require('../models/School');
const { successResponse } = require('../utils/response');
const { AuthenticationError, ValidationError, NotFoundError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { getJwtSecret } = require('../middleware/auth');

/**
 * User Login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required.');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .populate('roleId')
      .populate('schoolId');

    if (!user) {
      throw new AuthenticationError('Invalid email or password.');
    }

    if (user.status !== 'ACTIVE') {
      throw new AuthenticationError(`Account status is ${user.status}. Please contact administrator.`);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthenticationError('Invalid email or password.');
    }

    // Generate JWT Token
    const token = jwt.sign(
      { userId: user._id, email: user.email, roleId: user.roleId?._id || user.roleId },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const permissions = user.roleId?.permissions || [];

    await logAuditEvent({
      schoolId: user.schoolId?._id || user.schoolId,
      actorId: user._id,
      actorName: user.name,
      actorEmail: user.email,
      action: 'LOGIN',
      entity: 'User',
      entityId: user._id.toString(),
      details: { email: user.email },
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(
      res,
      {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          schoolId: user.schoolId?._id || user.schoolId,
          school: user.schoolId,
          role: {
            id: user.roleId?._id,
            name: user.roleId?.name,
            code: user.roleId?.code,
            hierarchyLevel: user.roleId?.hierarchyLevel,
            permissions,
          },
        },
      },
      'Login successful'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Logout
 */
const logout = async (req, res, next) => {
  try {
    if (req.user) {
      await logAuditEvent({
        schoolId: req.user.schoolId,
        actorId: req.user._id,
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'LOGOUT',
        entity: 'User',
        entityId: req.user._id.toString(),
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    res.clearCookie('token');
    return successResponse(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get Current User Profile
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('roleId').populate('schoolId');
    if (!user) {
      throw new NotFoundError('User profile not found.');
    }

    const permissions = user.roleId?.permissions || [];

    return successResponse(res, {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      schoolId: user.schoolId?._id || user.schoolId,
      school: user.schoolId,
      role: {
        id: user.roleId?._id,
        name: user.roleId?.name,
        code: user.roleId?.code,
        hierarchyLevel: user.roleId?.hierarchyLevel,
        permissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change Password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required.');
    }

    if (newPassword.length < 6) {
      throw new ValidationError('New password must be at least 6 characters.');
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      throw new ValidationError('Current password is incorrect.');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await logAuditEvent({
      schoolId: req.user.schoolId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorEmail: req.user.email,
      action: 'CHANGE_PASSWORD',
      entity: 'User',
      entityId: user._id.toString(),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  logout,
  getMe,
  changePassword,
};
