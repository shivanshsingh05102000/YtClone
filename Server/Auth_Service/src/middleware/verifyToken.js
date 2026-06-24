import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Verifies the access token from either the Authorization header or cookie.
// Attaches { id, role } to req.user on success.
const verifyToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const tokenFromHeader =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = tokenFromHeader || req.cookies?.accessToken;

  if (!token) {
    throw new ApiError(401, 'Access token missing');
  }

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  req.user = { id: decoded.id, role: decoded.role };
  next();
});

export default verifyToken;
