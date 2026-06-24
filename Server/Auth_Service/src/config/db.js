import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Tracks live connection state so the rest of the app (e.g. the DB-gate
// middleware) can check it synchronously without pinging Mongo each time.
let isConnected = false;
let retryAttempt = 0;

const MAX_RETRY_DELAY_MS = 30_000; // cap backoff at 30s
const BASE_RETRY_DELAY_MS = 1_000;

export const isDBConnected = () => isConnected;

function getRetryDelay() {
  // Exponential backoff starting at attempt 1: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
  const delay = BASE_RETRY_DELAY_MS * 2 ** (retryAttempt - 1);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

function scheduleReconnect() {
  retryAttempt += 1;
  const delay = getRetryDelay();
  logger.warn('Scheduling MongoDB reconnect attempt', { attempt: retryAttempt, delayMs: delay });

  setTimeout(() => {
    mongoose.connect(process.env.MONGO_URI).catch(() => {
      // Errors are handled by the 'error' event listener below; this catch
      // just prevents an unhandled promise rejection from the retry itself.
    });
  }, delay);
}

// Wire connection lifecycle events once, at module load.
mongoose.connection.on('connected', () => {
  isConnected = true;
  retryAttempt = 0; // reset backoff once we're healthy again
  logger.info('MongoDB connected', { host: mongoose.connection.host });
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB disconnected — requests requiring DB will return 503 until reconnected');
  scheduleReconnect();
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  logger.error('MongoDB connection error', { message: err.message });
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (err) {
    // Initial connection failed. Don't crash the process — log it and let
    // the retry loop take over so the service can still serve /health and
    // return clean 503s instead of being completely unreachable.
    logger.error('Initial MongoDB connection failed, will retry in background', {
      message: err.message,
    });
    scheduleReconnect();
  }
};

export default connectDB;
