import logger from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `${field} already exists`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // Mongoose buffering timeout (DB unreachable mid-request) — shouldn't
  // normally hit this since requireDB gates routes first, but covers any
  // route that forgot the gate, or a drop that happens mid-flight.
  if (err.name === 'MongooseError' && /buffering timed out/i.test(err.message)) {
    statusCode = 503;
    message = 'Service temporarily unavailable, please try again shortly';
  }

  // Invalid/expired JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  const meta = {
    requestId: req.requestId,
    statusCode,
    path: req.originalUrl,
    method: req.method,
  };

  if (statusCode >= 500) {
    logger.error(message, { ...meta, stack: err.stack });
  } else {
    logger.warn(message, meta);
  }

  res.status(statusCode).json({
    success: false,
    message,
    requestId: req.requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export default errorHandler;
