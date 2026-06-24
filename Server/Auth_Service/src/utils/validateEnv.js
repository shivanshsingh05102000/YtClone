import logger from './logger.js';

const REQUIRED_ENV_VARS = [
  'MONGO_URI',
  'ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
];

/**
 * Checks that required env vars are present before the app tries to use
 * them. Fails fast with one clear log line instead of a confusing crash
 * deep inside Mongoose or jsonwebtoken later on.
 */
export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables, cannot start', { missing });
    process.exit(1);
  }
}
