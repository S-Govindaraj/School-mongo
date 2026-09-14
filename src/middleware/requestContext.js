const { errorResponse } = require('../utils/response');
const logger = require('../config/logger');
const { redactSensitiveData } = require('./auditLogger');

const requestContextMiddleware = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  res.setHeader('X-Request-ID', req.requestId);

  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`[${req.requestId}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });

  next();
};

const errorHandlerMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let errors = err.errors || null;

  // Handle Mongoose specific errors gracefully as per Section 28
  if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = `Invalid ID format for parameter: ${err.path}`;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    const fieldErrors = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    message = `Validation failed: ${fieldErrors.map((f) => `${f.field}: ${f.message}`).join(', ')}`;
    errors = fieldErrors;
  } else if (err.code === 11000 || err.code === 11001) {
    statusCode = 409;
    errorCode = 'DUPLICATE_RESOURCE';
    const keys = Object.keys(err.keyPattern || {});
    message = `A resource with duplicate field(s) [${keys.join(', ')}] already exists.`;
  }

  // Log error with complete context (Section 27)
  logger.error(`[${req.requestId || 'N/A'}] ${err.name || 'Error'}: ${message}`, {
    requestId: req.requestId,
    endpoint: req.originalUrl,
    method: req.method,
    statusCode,
    userId: req.user?._id || null,
    schoolId: req.schoolContext?.schoolId || null,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    exceptionType: err.name || 'Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    requestPayload: redactSensitiveData(req.body),
    queryParameters: redactSensitiveData(req.query),
  });

  return errorResponse(res, message, statusCode, errorCode, errors);
};

module.exports = {
  requestContextMiddleware,
  errorHandlerMiddleware,
};
