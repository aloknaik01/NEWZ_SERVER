// src/routes/authRoutes.js - FIXED (No React Native imports)
import express from 'express';
import AuthController from '../controllers/authController.js';
import {
  registerValidation,
  loginValidation,
  verifyOTPValidation,
  emailValidation,
  resetRequestValidation,
  resetPasswordValidation,
  validate
} from '../middlewares/validations.js';
import { authLimiter, resendLimiter } from '../middlewares/security.js';

const router = express.Router();

// Register with referral code support
router.post('/register', 
  // authLimiter, 
  registerValidation, 
  validate, 
  AuthController.register
);

// Login
router.post('/login', 
  authLimiter, 
  loginValidation, 
  validate, 
  AuthController.login
);

// ✅ BACKWARD COMPATIBLE: Support both old token links (GET) and new OTP (POST)
// Old: GET /verify-email?token=xxxxx
router.get('/verify-email', 
  authLimiter,
  AuthController.verifyEmail
);

// New: POST /verify-email { email, otp }
router.post('/verify-email', 
  authLimiter,
  verifyOTPValidation,
  validate,
  AuthController.verifyEmail
);

// Resend OTP
router.post('/resend-verification', 
  resendLimiter, 
  emailValidation, 
  validate, 
  AuthController.resendVerification
);

// Password reset request
router.post('/forgot-password', 
  authLimiter, 
  resetRequestValidation, 
  validate, 
  AuthController.requestPasswordReset
);

// Reset password
router.post('/reset-password', 
  authLimiter, 
  resetPasswordValidation, 
  validate, 
  AuthController.resetPassword
);

// Refresh token
router.post('/refresh-token', 
  AuthController.refreshToken
);

// Logout
router.post('/logout', 
  AuthController.logout
);

export default router;