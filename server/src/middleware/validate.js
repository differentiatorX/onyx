// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const { badRequest } = require('../lib/errors');

/** Validates req[source] with a zod schema and stores the parsed value in req.validated. */
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) return next(badRequest('Request validation failed', result.error.flatten()));
  req.validated = result.data;
  return next();
};
