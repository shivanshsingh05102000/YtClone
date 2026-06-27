import crypto from 'crypto';
import logger from '../utils/logger.js';

// Assigns a short request ID and logs method/path/status/duration for every
// request. Attaches req.requestId so controllers/error handler can include
// it too, making it possible to trace one request through the full log trail.
const requestLogger = (req, res, next) => {
  req.requestId = crypto.randomBytes(4).toString('hex');
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    };

    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', meta);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', meta);
    } else {
      logger.info('Request completed', meta);
    }
  });

  next();
};

export default requestLogger;
