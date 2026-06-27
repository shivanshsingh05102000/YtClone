import logger from './logger.js';

const REQUIRED_ENV_VARS = ['MONGO_URI', 'ACCESS_TOKEN_SECRET'];

export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables, cannot start', { missing });
    process.exit(1);
  }
}
