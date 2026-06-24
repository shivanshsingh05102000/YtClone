import logger from './logger.js';

/**
 * Registers process-wide safety nets so a single bad async call or a
 * thrown error in code that forgot try/catch can't silently crash the
 * entire service.
 *
 * Important distinction:
 * - unhandledRejection: almost always safe to just log and continue —
 *   it means a Promise rejected with no .catch(), the process is otherwise
 *   in a known-good state.
 * - uncaughtException: more dangerous — the process may now be in an
 *   undefined state (mid-stack-unwind). Best practice is to log it clearly,
 *   then exit so a process manager (nodemon/pm2) can restart cleanly,
 *   rather than keep running in a potentially corrupted state.
 */
export function registerProcessSafetyNets() {
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection (process kept alive)', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — exiting for clean restart', {
      message: err.message,
      stack: err.stack,
    });
    // Give the logger a tick to flush before exiting.
    setTimeout(() => process.exit(1), 100);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}
