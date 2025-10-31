import express from 'express';
import passport from '../config/passport.js';
import AuthController from '../controllers/authController.js';
import {
  registerValidation,
  loginValidation,
  emailValidation,
  resetRequestValidation,
  resetPasswordValidation,
  validate
} from '../middlewares/validations.js';
import { authLimiter, resendLimiter } from '../middlewares/security.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
import WalletModel from '../models/walletModel.js';
import { parseUserAgent } from '../utils/helpers.js';
import pool from '../config/database.js';

const router = express.Router();

// Email/Password Routes
router.post('/register', authLimiter, registerValidation, validate, AuthController.register);
router.post('/login', authLimiter, loginValidation, validate, AuthController.login);
router.get('/verify-email', AuthController.verifyEmail);
router.post('/resend-verification', resendLimiter, emailValidation, validate, AuthController.resendVerification);
router.post('/forgot-password', authLimiter, resetRequestValidation, validate, AuthController.requestPasswordReset);
router.post('/reset-password', authLimiter, resetPasswordValidation, validate, AuthController.resetPassword);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/logout', AuthController.logout);

// Google OAuth Routes
router.post('/google/token', async (req, res) => {
  const client = await pool.connect();

  try {
    const { googleAccessToken, email, name, googleId, profileImage } = req.body;

    if (!googleAccessToken || !email || !googleId) {
      return errorResponse(res, 400, 'Missing required Google data');
    }

    // Check if user exists with Google ID
    let user = await UserModel.findByGoogleId(googleId);

    if (user) {
      // Existing Google user - just login
      const accessToken = generateAccessToken(user.user_id, user.email, user.role);
      const refreshToken = await generateRefreshToken(user.user_id);

      await UserModel.updateLastLogin(user.user_id);
      const wallet = await WalletModel.getBalance(user.user_id);

      return successResponse(res, 200, 'Google login successful', {
        user: {
          userId: user.user_id,
          email: user.email,
          fullName: user.full_name,
          profileImage: user.profile_image,
          emailVerified: true,
          referralCode: user.referral_code,
        },
        wallet: {
          availableCoins: wallet?.available_coins || 0,
          totalEarned: wallet?.total_earned || 0,
          totalRedeemed: wallet?.total_redeemed || 0,
        },
        tokens: {
          accessToken,
          refreshToken
        }
      });
    }

    // Check if user exists with same email (different provider)
    user = await UserModel.findByEmail(email);

    if (user) {
      // Link Google account to existing email user
      await client.query(
        'UPDATE users SET google_id = $1, login_provider = $2, email_verified = true WHERE user_id = $3',
        [googleId, 'google', user.user_id]
      );

      const accessToken = generateAccessToken(user.user_id, user.email, user.role);
      const refreshToken = await generateRefreshToken(user.user_id);

      await UserModel.updateLastLogin(user.user_id);
      const wallet = await WalletModel.getBalance(user.user_id);

      return successResponse(res, 200, 'Google account linked successfully', {
        user: {
          userId: user.user_id,
          email: user.email,
          fullName: user.full_name,
          profileImage: user.profile_image || profileImage,
          emailVerified: true,
          referralCode: user.referral_code,
        },
        wallet: {
          availableCoins: wallet?.available_coins || 0,
          totalEarned: wallet?.total_earned || 0,
        },
        tokens: {
          accessToken,
          refreshToken
        }
      });
    }

    // New user - create account with Google
    await client.query('BEGIN');

    const referralCode = await generateReferralCode();

    const newUserResult = await client.query(
      `INSERT INTO users (email, google_id, referral_code, login_provider, email_verified)
       VALUES ($1, $2, $3, 'google', true)
       RETURNING user_id, email, referral_code, google_id`,
      [email, googleId, referralCode]
    );

    const newUser = newUserResult.rows[0];

    await client.query(
      `INSERT INTO user_profiles (user_id, full_name, profile_image, country)
       VALUES ($1, $2, $3, 'India')`,
      [newUser.user_id, name, profileImage]
    );

    await client.query(
      `INSERT INTO user_wallets (user_id) VALUES ($1)`,
      [newUser.user_id]
    );

    await client.query('COMMIT');

    const accessToken = generateAccessToken(newUser.user_id, newUser.email, 'user');
    const refreshToken = await generateRefreshToken(newUser.user_id);

    return successResponse(res, 201, 'Google signup successful', {
      user: {
        userId: newUser.user_id,
        email: newUser.email,
        fullName: name,
        profileImage: profileImage,
        emailVerified: true,
        referralCode: newUser.referral_code,
      },
      wallet: {
        availableCoins: 0,
        totalEarned: 0,
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Google token auth error:', error);
    return errorResponse(res, 500, 'Google authentication failed');
  } finally {
    client.release();
  }
});

export default router;