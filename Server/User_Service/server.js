import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB, { isDBConnected } from './src/config/db.js';
import userRoutes from './src/routes/user.routes.js';
import errorHandler from './src/middleware/errorHandler.js';
import requestLogger from './src/middleware/requestLogger.js';
import logger from './src/utils/logger.js';
import { registerProcessSafetyNets } from './src/utils/processSafety.js';
import { validateEnv } from './src/utils/validateEnv.js';

dotenv.config();

registerProcessSafetyNets();
validateEnv();

const app = express();
const PORT = process.env.PORT || 3002;

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

app.get('/health', (req, res) => {
  const dbConnected = isDBConnected();
  res.status(200).json({
    status: dbConnected ? 'ok' : 'degraded',
    service: 'User_Service',
    db: dbConnected ? 'connected' : 'disconnected',
  });
});

app.use('/api/users', userRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info('User service listening', { port: PORT });
});

connectDB();
