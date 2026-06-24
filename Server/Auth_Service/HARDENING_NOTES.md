# Auth_Service — Production Hardening Notes

This service is the reference pattern for all other microservices in this
project. When building out User_Service, Video_Service, etc., copy these
files as-is and just change the values noted below.

## Files to copy unchanged

- `src/utils/logger.js` — structured logger, uniform format across all services
- `src/utils/processSafety.js` — uncaughtException / unhandledRejection handlers
- `src/utils/asyncHandler.js` — wraps async controllers, forwards errors to next()
- `src/utils/ApiError.js` — custom error class with statusCode
- `src/middleware/errorHandler.js` — centralized error handler, uses logger
- `src/middleware/requestLogger.js` — per-request ID + timing logs
- `src/middleware/requireDB.js` — fast 503 instead of hanging when DB is down

## Files to copy and adapt

- `src/config/db.js` — copy as-is; it's generic Mongoose connection logic
  with retry/backoff. No per-service changes needed unless a service uses a
  different DB.
- `src/utils/validateEnv.js` — update `REQUIRED_ENV_VARS` to match whatever
  that service actually needs (e.g. User_Service probably doesn't need
  `ACCESS_TOKEN_SECRET`/`REFRESH_TOKEN_SECRET`, but does need `MONGO_URI`).
- `server.js` — same skeleton (validateEnv → registerProcessSafetyNets →
  app.listen immediately → connectDB in background), swap in that service's
  own routes.

## Per-service .env additions

Every service's `.env` should set:
```
SERVICE_NAME=<Exact_Service_Name>   # matches allServiceRunner.js naming, e.g. User_Service
LOG_LEVEL=info                       # set to "debug" for verbose local debugging
```

This is what makes every service's logs show up in the same
`[Service_Name]` tag format in allServiceRunner's multiplexed output.

## Log format

```
[2026-06-21T08:23:14.753Z] INFO  [Auth_Service] Auth service listening {"port":3001}
[2026-06-21T08:23:15.244Z] ERROR [Auth_Service] Request completed with server error {"requestId":"ced8e52b","status":503}
```

`timestamp | LEVEL (padded) | [Service_Name] | message | {metadata as JSON}`

Color-coded by level (red=ERROR, yellow=WARN, cyan=INFO, grey=DEBUG) — this
plays nicely alongside allServiceRunner's own per-service color tagging.

## Why the server doesn't block on DB connection

Old pattern: `connectDB().then(() => app.listen(...))` — meant the entire
HTTP server, including `/health`, was unreachable until Mongo connected.
One slow or down DB took the whole service off the map.

New pattern: `app.listen(...)` fires immediately. `connectDB()` runs in the
background with automatic retry (exponential backoff: 1s, 2s, 4s, 8s, 16s,
capped at 30s). Routes that need the DB are gated by `requireDB` middleware,
which returns a clean `503` in milliseconds instead of letting requests
hang on Mongoose's ~10s buffering timeout.

`/health` always responds `200`, but with `status: "degraded"` and
`db: "disconnected"` when Mongo is down — so a load balancer or API Gateway
can still reach the service and learn it's unhealthy, rather than treating
it as completely dead.

## Process safety nets

`registerProcessSafetyNets()` (called once, first thing in `server.js`)
handles:
- `unhandledRejection` — logged, process stays alive (state is still sound)
- `uncaughtException` — logged, then process exits cleanly so nodemon/pm2
  can restart it (state may be corrupted, safer to restart than limp on)
- `SIGTERM`/`SIGINT` — graceful shutdown logging

## Known gotcha: ESM import order

`logger.js` reads `process.env.SERVICE_NAME` lazily inside its write
function, NOT as a module-level constant. ESM imports are hoisted, so if
any middleware imports logger.js before `dotenv.config()` runs in
server.js, a module-level read would capture an empty value permanently.
Keep this lazy-read pattern when copying to other services.
