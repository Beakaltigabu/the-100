const { logError } = require('../services/logger');

class AppError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFound(req, res, next) {
  next(new AppError(`Not found: ${req.method} ${req.originalUrl}`, 404));
}

function errorHandler(err, req, res, next) {
  const path = req.originalUrl ? req.originalUrl.split('?')[0] : null;
  if (err instanceof AppError) {
    logError({
      level: err.statusCode >= 500 ? 'error' : 'warn',
      source: 'app',
      message: err.message,
      path,
      user_id: req.user ? req.user.id : null,
      meta: { status: err.statusCode }
    });
    // 5xx AppErrors can carry internal config/implementation detail — send the
    // client a generic message and keep the detail in the server-side log.
    const clientMessage = err.statusCode >= 500 ? 'Internal server error' : err.message;
    return res.status(err.statusCode).json({ error: clientMessage, details: err.details });
  }
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  console.error(err);
  logError({
    level: 'error',
    source: 'app',
    message: err.message || String(err),
    stack: err.stack,
    path,
    user_id: req.user ? req.user.id : null,
    meta: { status: 500 }
  });
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { AppError, asyncHandler, notFound, errorHandler };