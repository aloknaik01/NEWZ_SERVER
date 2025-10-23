import { verifyAccessToken } from '../utils/tokenUtils.js';
import { errorResponse } from '../utils/responseHandler.js';

// Verify JWT Token
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'Access denied. No token provided.');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return errorResponse(res, 401, 'Invalid or expired token');
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return errorResponse(res, 500, 'Authentication failed');
  }
};

// Check user role
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Unauthorized. Please login.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(res, 403, 'Forbidden. Insufficient permissions.');
    }

    next();
  };
};

// Optional authentication (for public routes that can show personalized content if logged in)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);

      if (decoded) {
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role
        };
      }
    }

    next();
  } catch (error) {
    // Don't block request if token is invalid
    next();
  }
};