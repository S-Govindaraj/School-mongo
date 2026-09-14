/**
 * Standard API Success Response Formatter
 */
const successResponse = (res, data = null, message = 'Success', statusCode = 200, meta = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta: {
      requestId: res.req?.requestId || null,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
};

/**
 * Standard API Error Response Formatter
 */
const errorResponse = (res, message = 'Error', statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', errors = null) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      ...(errors ? { details: errors } : {}),
    },
    meta: {
      requestId: res.req?.requestId || null,
      timestamp: new Date().toISOString(),
    },
  });
};

module.exports = {
  successResponse,
  errorResponse,
};
