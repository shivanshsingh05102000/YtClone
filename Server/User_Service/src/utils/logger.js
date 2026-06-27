/**
 * Structured logger — uniform output shape across every microservice.
 *
 * Format: [TIMESTAMP] LEVEL [SERVICE] message {metadata}
 *
 * To reuse in another service: copy this file unchanged and set
 * SERVICE_NAME via env var, e.g. SERVICE_NAME=user-service in .env.
 * This keeps every service's logs visually identical in allServiceRunner's
 * multiplexed output, just with a different [SERVICE] tag.
 */

// Read lazily (not at module load) so this still works correctly regardless
// of whether this module is imported before or after dotenv.config() runs —
// ESM imports are hoisted, so a module-level constant here would have
// captured an empty value if any earlier import chain pulled this file in
// before server.js's dotenv.config() line executed.
function getServiceName() {
  return process.env.SERVICE_NAME || 'unknown-service';
}

const LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

// ANSI colors — safe no-ops if the terminal doesn't support them
const COLORS = {
  ERROR: '\x1b[31m', // red
  WARN: '\x1b[33m', // yellow
  INFO: '\x1b[36m', // cyan
  DEBUG: '\x1b[90m', // grey
  RESET: '\x1b[0m',
};

function timestamp() {
  return new Date().toISOString();
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    return ' ' + JSON.stringify(meta);
  } catch {
    return ' [unserializable metadata]';
  }
}

function write(level, message, meta) {
  const color = COLORS[level] || '';
  const line = `${color}[${timestamp()}] ${level.padEnd(5)} [${getServiceName()}] ${message}${formatMeta(
    meta
  )}${COLORS.RESET}`;

  if (level === LEVELS.ERROR) {
    console.error(line);
  } else {
    console.log(line);
  }
}

const logger = {
  error: (message, meta) => write(LEVELS.ERROR, message, meta),
  warn: (message, meta) => write(LEVELS.WARN, message, meta),
  info: (message, meta) => write(LEVELS.INFO, message, meta),
  debug: (message, meta) => {
    // Skip debug noise unless explicitly enabled
    if (process.env.LOG_LEVEL === 'debug') write(LEVELS.DEBUG, message, meta);
  },
};

export default logger;
