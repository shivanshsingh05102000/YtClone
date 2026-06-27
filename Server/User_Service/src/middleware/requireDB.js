import { isDBConnected } from '../config/db.js';

// Routes that touch the DB should sit behind this. If Mongo is currently
// disconnected, fail fast with a clean 503 instead of letting the request
// hang for ~10s on Mongoose's default command buffering timeout.
const requireDB = (req, res, next) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable, please try again shortly',
    });
  }
  next();
};

export default requireDB;
