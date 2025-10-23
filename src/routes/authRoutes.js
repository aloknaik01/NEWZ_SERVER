import express from 'express';
import passport from '../config/passport.js';
import AuthController from '../controllers/authController.js';
import { registerValidation, loginValidation, validate } from '../middlewares/validation.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
import WalletModel from '../models/walletModel.js';
import { successResponse } from '../utils/responseHandler.js';
import { parseUserAgent } from '../utils/helpers.js';
import pool from '../config/database.js';

const router = express.Router();

// Email/Password Routes
router.post('/register', registerValidation, validate, AuthController.register);
router.post('/login', loginValidation, validate, AuthController.login);
router.get('/verify-email', AuthController.verifyEmail);
router.post('/logout', AuthController.logout);
router.post('/refresh-token', AuthController.refreshToken);

// Google OAuth Routes
router.get(
  '/google',
  (req, res, next) => {
    // Store referral code in session if present
    if (req.query.ref) {
      req.session.referralCode = req.query.ref;
    }
    next();
  },
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=google_auth_failed`,
    session: true
  }),
  async (req, res) => {
    try {
      const user = req.user;

      // Generate tokens
      const accessToken = generateAccessToken(user.user_id, user.email, user.role);
      const refreshToken = await generateRefreshToken(user.user_id);

      // Update last login
      await pool.query(
        'UPDATE users SET last_login = NOW() WHERE user_id = $1',
        [user.user_id]
      );

      // Log login history
      const { deviceType, deviceName } = parseUserAgent(req.headers['user-agent']);

      await pool.query(
        `INSERT INTO login_history (user_id, login_method, ip_address, device_type, device_name)
         VALUES ($1, 'google', $2, $3, $4)`,
        [user.user_id, req.ip, deviceType, deviceName]
      );

      // Get wallet info
      const wallet = await WalletModel.getBalance(user.user_id);

      // Redirect to frontend with tokens
      const redirectUrl = `${process.env.CLIENT_URL}/auth/callback?` +
        `accessToken=${accessToken}&` +
        `refreshToken=${refreshToken}&` +
        `userId=${user.user_id}&` +
        `email=${user.email}&` +
        `name=${encodeURIComponent(user.full_name || '')}&` +
        `coins=${wallet?.available_coins || 0}`;

      res.redirect(redirectUrl);

    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=authentication_failed`);
    }
  }
);

// Get current Google auth user info (for testing)
router.get('/google/user', (req, res) => {
  if (req.isAuthenticated()) {
    return successResponse(res, 200, 'User authenticated', req.user);
  }
  res.status(401).json({ success: false, message: 'Not authenticated' });
});

export default router;