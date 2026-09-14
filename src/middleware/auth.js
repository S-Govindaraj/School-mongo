const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const { AuthenticationError, ForbiddenError } = require('../utils/errors');

const authenticate = async (req, res, next) => {
  try {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new AuthenticationError('Authentication required. Token missing.');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    const user = await User.findById(decoded.userId).populate('roleId');

    if (!user || user.status !== 'ACTIVE') {
      throw new AuthenticationError('User profile inactive or unauthenticated.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(new AuthenticationError(error.message || 'Invalid authentication token.'));
  }
};

const requirePermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roleId) {
      return next(new ForbiddenError('Access denied. No role assigned.'));
    }

    const userPermissions = req.user.roleId.permissions || [];
    const hasPermission = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasPermission && req.user.roleId.code !== 'SUPER_ADMIN') {
      return next(new ForbiddenError(`Required permission missing: ${requiredPermissions.join(', ')}`));
    }

    next();
  };
};

module.exports = {
  authenticate,
  requirePermissions,
};
