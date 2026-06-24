import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateAccessToken, generateRefreshToken } from '../utils/generateTokens.js';
import logger from '../utils/logger.js';
import jwt from 'jsonwebtoken';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    throw new ApiError(400, 'username, email, and password are all required');
  }
  // Reject non-string fields before they ever reach a Mongoose query. Without
  // this, a body like { "email": { "$ne": null } } would be cast by
  // Mongoose into a literal query operator (sanitizeFilter is off by
  // default), matching arbitrary documents instead of failing safely.
  if (
    typeof username !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    throw new ApiError(400, 'username, email, and password must be strings');
  }
  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new ApiError(400, 'Password must not exceed 72 bytes');
  }

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    throw new ApiError(409, 'A user with that email or username already exists');
  }

  const user = await User.create({ username, email, password });

  logger.info('User registered', { requestId: req.requestId, userId: user._id.toString() });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'email and password are required');
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new ApiError(400, 'email and password must be strings');
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  await user.setRefreshToken(refreshToken);
  await user.save();

  logger.info('User logged in', { requestId: req.requestId, userId: user._id.toString() });

  // Tokens are delivered via httpOnly cookies only — not echoed in the JSON
  // body. Returning them in both places means an XSS bug anywhere on the
  // frontend can read the token straight out of the fetch response, which
  // defeats the point of httpOnly. Clients that need the access token for
  // an Authorization header (e.g. a mobile app) should read it from here;
  // browser clients should rely on the cookie and never touch this field.
  res
    .status(200)
    .cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 min
    })
    .cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
    .json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
});

// POST /api/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
  const incomingToken = req.body.refreshToken || req.cookies?.refreshToken;

  if (!incomingToken) {
    throw new ApiError(401, 'Refresh token missing');
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(decoded.id).select('+refreshTokenHash');
  if (!user) {
    throw new ApiError(401, 'User no longer exists');
  }

  const isValid = await user.compareRefreshToken(incomingToken);
  if (!isValid) {
    // token reuse / mismatch — invalidate session defensively. This can
    // indicate a stolen/replayed refresh token, so it's worth flagging
    // distinctly from an ordinary expired-token 401.
    logger.warn('Refresh token mismatch — possible token reuse, session invalidated', {
      requestId: req.requestId,
      userId: user._id.toString(),
    });
    user.refreshTokenHash = null;
    await user.save();
    throw new ApiError(401, 'Refresh token invalid, please log in again');
  }

  // Rotate: issue a brand new pair, invalidate the old refresh token
  const newAccessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = generateRefreshToken(user._id);

  await user.setRefreshToken(newRefreshToken);
  await user.save();

  res
    .status(200)
    .cookie('accessToken', newAccessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    })
    .cookie('refreshToken', newRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      success: true,
      message: 'Token refreshed',
    });
});

// POST /api/auth/logout
export const logout = asyncHandler(async (req, res) => {
  const incomingToken = req.body.refreshToken || req.cookies?.refreshToken;

  if (incomingToken) {
    try {
      const decoded = jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        user.refreshTokenHash = null;
        await user.save();
      }
    } catch {
      // token already invalid/expired — nothing to clean up, proceed to clear cookies
    }
  }

  res
    .status(200)
    .clearCookie('accessToken', cookieOptions)
    .clearCookie('refreshToken', cookieOptions)
    .json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me  (protected — sanity check for verifyToken middleware)
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
});