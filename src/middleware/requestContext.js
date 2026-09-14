const { errorResponse } = require('../utils/response');
const logger = require('../config/logger');

const requestContextMiddleware = (req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  res.setHeader('X-Request-ID', req.requestId);

  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`[${req.requestId}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });

  next();
};

const errorHandlerMiddleware = (err, req, res, next) => {
  logger.error(`[${req.requestId || 'N/A'}] ${err.name}: ${err.message}`, { stack: err.stack });

  const statusCode = err.statusCode || 500;
  const errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';

  return errorResponse(res, message, statusCode, errorCode, err.errors);
};

module.exports = {
  requestContextMiddleware,
  errorHandlerMiddleware,
};
