// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  AppError,
  badRequest: (message, details) => new AppError(400, 'invalid_request', message, details),
  unauthorized: (message = 'Authentication required') => new AppError(401, 'unauthorized', message),
  forbidden: (message = 'Not allowed') => new AppError(403, 'forbidden', message),
  notFound: (message = 'Not found') => new AppError(404, 'not_found', message),
  conflict: (message, code = 'conflict') => new AppError(409, code, message),
  unprocessable: (message, code = 'unprocessable') => new AppError(422, code, message),
  tooManyRequests: (message) => new AppError(429, 'rate_limited', message),
};
