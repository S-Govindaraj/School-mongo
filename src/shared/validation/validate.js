const { ValidationError } = require('../../utils/errors');

/**
 * Middleware factory to validate request against a Zod schema.
 * @param {import('zod').ZodSchema} schema 
 * @param {'body' | 'query' | 'params'} target 
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    try {
      const result = schema.safeParse(req[target]);
      if (!result.success) {
        const rawIssues = result.error?.issues || result.error?.errors || [];
        const issues = rawIssues.map((e) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message,
        }));
        throw new ValidationError('Validation failed: ' + issues.map((i) => `${i.field}: ${i.message}`).join(', '), issues);
      }
      req[target] = result.data;
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = validate;
