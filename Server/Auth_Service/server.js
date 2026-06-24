import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB, { isDBConnected } from './src/config/db.js';
import authRoutes from './src/routes/auth.routes.js';
import errorHandler from './src/middleware/errorHandler.js';
import requestLogger from './src/middleware/requestLogger.js';
import logger from './src/utils/logger.js';
import { registerProcessSafetyNets } from './src/utils/processSafety.js';
import { validateEnv } from './src/utils/validateEnv.js';

dotenv.config();

// Must run before anything else touches process-level error events.
registerProcessSafetyNets();
validateEnv();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

// Health check reflects real DB status, doesn't require DB to respond.
// 200 = fully healthy. 200 with degraded flag = up but DB is down, so callers
// (e.g. an API Gateway or load balancer) can still tell something's off
// without treating the whole service as dead.
app.get('/health', (req, res) => {
  const dbConnected = isDBConnected();
  res.status(200).json({
    status: dbConnected ? 'ok' : 'degraded',
    service: 'Auth_Service',
    db: dbConnected ? 'connected' : 'disconnected',
  });
});

app.use('/api/auth', authRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Centralized error handler — must be last
app.use(errorHandler);

// Listen immediately. Don't gate the HTTP server itself behind a successful
// DB connection — that made the entire service unreachable (including
// /health) during a slow or failed Mongo connection. DB readiness is now
// enforced per-route via the requireDB middleware instead.
app.listen(PORT, () => {
  logger.info('Auth service listening', { port: PORT });
});

connectDB();
