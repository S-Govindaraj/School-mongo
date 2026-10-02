const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const { AuthenticationError, ForbiddenError } = require('../utils/errors');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production!');
    }
    return 'development_school_erp_secure_jwt_secret_key_2026';
  }
  return secret;
};

const authenticate = async (req, res, next) => {
  try {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new AuthenticationError('Authentication required. Token missing.');
    }

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.userId)
      .select('name email phone status schoolId roleId')
      .populate('roleId', 'name code permissions hierarchyLevel')
      .lean();

    if (!user || user.status !== 'ACTIVE') {
      throw new AuthenticationError('User profile inactive or unauthenticated.');
    }

    req.user = user;
    req.schoolContext = {
      schoolId: user.schoolId?._id || user.schoolId,
    };
    next();
  } catch (error) {
    next(new AuthenticationError(error.message || 'Invalid authentication token.'));
  }
};

const optionalAuthenticate = async (req, res, next) => {
  try {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, getJwtSecret());
        const user = await User.findById(decoded.userId)
          .select('name email phone status schoolId roleId')
          .populate('roleId', 'name code permissions hierarchyLevel')
          .lean();
        if (user && user.status === 'ACTIVE') {
          req.user = user;
          req.schoolContext = {
            schoolId: user.schoolId?._id || user.schoolId,
          };
        }
      } catch (_) {
        // Ignore token errors for optional authentication
      }
    }
    next();
  } catch (error) {
    next();
  }
};

const requirePermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roleId) {
      return next(new ForbiddenError('Access denied. No role assigned.'));
    }

    const userPermissions = req.user.roleId.permissions || [];

    // Bypass check ONLY if wildcard '*' is explicitly granted
    if (userPermissions.includes('*')) {
      return next();
    }

    const hasPermission = requiredPermissions.every((perm) => {
      // Check direct code match
      if (userPermissions.includes(perm)) return true;
      // Support dot and underscore formats interchangeably
      const underscorePerm = typeof perm === 'string' ? perm.replace(/\./g, '_') : '';
      if (underscorePerm && userPermissions.includes(underscorePerm)) return true;
      const dotPerm = typeof perm === 'string' ? perm.replace(/_/g, '.') : '';
      if (dotPerm && userPermissions.includes(dotPerm)) return true;
      return false;
    });

    if (!hasPermission) {
      return next(new ForbiddenError(`Required permission missing: ${requiredPermissions.join(', ')}`));
    }

    next();
  };
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  requirePermissions,
  getJwtSecret,
};
