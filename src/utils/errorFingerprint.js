const crypto = require('crypto');

const normalizeMessage = (message = '') =>
  String(message)
    .replace(/[0-9a-f]{24}/gi, ':id') // Mongo ObjectId
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ':email')
    .replace(/"[^"]*"|'[^']*'/g, ':str')
    .replace(/\b\d+\b/g, ':n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const topApplicationFrame = (stack = '') => {
  if (!stack) return '';
  const lines = String(stack).split('\n').slice(1);
  const frame = lines.find((line) => line.includes('/src/') && !line.includes('node_modules'));
  if (!frame) return '';
  const match = frame.match(/([^/\\\s]+\.js):(\d+):\d+/);
  return match ? `${match[1]}:${match[2]}` : frame.trim();
};

const computeFingerprint = ({ errorType = 'Error', message = '', route = '', method = '', stack = '' } = {}) => {
  const parts = [errorType || 'Error', normalizeMessage(message), method || '', route || '', topApplicationFrame(stack)];
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return hash.slice(0, 16);
};

const computeFrontendFingerprint = ({ errorType = 'Error', message = '', routePattern = '', errorKind = '', stack = '' } = {}) => {
  const parts = [errorType || 'Error', normalizeMessage(message), errorKind || '', routePattern || '', topApplicationFrame(stack)];
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return hash.slice(0, 16);
};

const CRITICAL_ERROR_TYPES = new Set(['MongoNetworkError', 'MongoServerSelectionError', 'MongooseServerSelectionError']);
const CRITICAL_ENDPOINT_HINTS = [/\/finance\/.*\/collect/i, /\/finance\/.*\/invoices/i, /\/auth\/login/i];

const classifySeverity = ({ statusCode, errorType = '', endpoint = '', isUncaught = false } = {}) => {
  if (isUncaught) return 'critical';
  if (CRITICAL_ERROR_TYPES.has(errorType)) return 'critical';
  if (statusCode >= 500 && CRITICAL_ENDPOINT_HINTS.some((re) => re.test(endpoint))) return 'critical';

  if (statusCode >= 500) return 'error'; // HIGH
  if (statusCode === 401 || statusCode === 403) return 'warning'; // MEDIUM
  if (statusCode >= 400) return 'info'; // LOW

  return 'error';
};

const classifyFrontendSeverity = ({ errorKind = '', statusCode } = {}) => {
  if (errorKind === 'render') return 'critical';
  if (errorKind === 'unhandled-exception' || errorKind === 'unhandled-rejection') return 'error';
  if (errorKind === 'api-failure') return statusCode >= 500 ? 'error' : 'warning';
  if (errorKind === 'manual') return 'info';
  return 'error';
};

module.exports = {
  computeFingerprint,
  computeFrontendFingerprint,
  normalizeMessage,
  topApplicationFrame,
  classifySeverity,
  classifyFrontendSeverity,
};
