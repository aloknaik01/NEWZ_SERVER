// src/controllers/authController.js - FULLY FIXED
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import UserModel from '../models/userModel.js';
import WalletModel from '../models/walletModel.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
import { generateReferralCode, parseUserAgent } from '../utils/helpers.js';
import { sendVerificationOTP, sendPasswordResetEmail } from '../utils/emailService.js'; // ✅ OTP function
import { successResponse, errorResponse } from '../utils/responseHandler.js';

// ✅ Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

class AuthController {
  // ✅ REGISTER WITH REFERRAL CODE & OTP
  static async register(req, res) {
    const client = await pool.connect();

    try {
      const { email, password, fullName, referralCode } = req.body;

      if (referralCode && (referralCode.length !== 8 || !/^[A-Z0-9]+$/.test(referralCode))) {
        return errorResponse(res, 400, 'Invalid referral code format');
      }

      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        return errorResponse(res, 400, 'Email already registered');
      }

      // Verify referral code exists (if provided)
      let referrerId = null;
      if (referralCode) {
        const referrerCheck = await client.query(
          'SELECT user_id FROM users WHERE referral_code = $1',
          [referralCode]
        );

        if (referrerCheck.rows.length === 0) {
          return errorResponse(res, 400, 'Invalid referral code');
        }

        referrerId = referrerCheck.rows[0].user_id;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const newReferralCode = await generateReferralCode();
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await client.query('BEGIN');

      // Create user
      const newUser = await client.query(
        `INSERT INTO users (email, password_hash, referral_code, referred_by_code, login_provider)
         VALUES ($1, $2, $3, $4, 'email')
         RETURNING user_id, email, referral_code`,
        [email.toLowerCase(), passwordHash, newReferralCode, referralCode || null]
      );

      const user = newUser.rows[0];

      // Create profile
      await client.query(
        `INSERT INTO user_profiles (user_id, full_name, country)
         VALUES ($1, $2, 'India')`,
        [user.user_id, fullName]
      );

      // Create wallet
      await client.query(
        `INSERT INTO user_wallets (user_id) VALUES ($1)`,
        [user.user_id]
      );

      // ✅ NEW LOGIC: 2-Tier Referral System
      let signupBonusAmount = 0;

      if (referrerId) {
        const referrerBonusAmount = parseInt(process.env.REFERRAL_SIGNUP_BONUS || 100); // For referrer (after 20 articles)
        signupBonusAmount = parseInt(process.env.SIGNUP_BONUS || 100); // For new user (instant)

        // Create referral record (referrer bonus NOT given yet)
        await client.query(
          `INSERT INTO referrals (
            referrer_user_id, 
            referred_user_id, 
            referral_code, 
            signup_bonus_coins, 
            signup_bonus_given,
            status
          ) VALUES ($1, $2, $3, $4, false, 'pending')`,
          [referrerId, user.user_id, referralCode, referrerBonusAmount]
        );

        // ✅ Give INSTANT signup bonus to NEW USER (User B)
        await client.query(
          `UPDATE user_wallets 
           SET available_coins = available_coins + $2,
               total_earned = total_earned + $2
           WHERE user_id = $1`,
          [user.user_id, signupBonusAmount]
        );

        // Log transaction for new user
        await client.query(
          `INSERT INTO coin_transactions (
            user_id, transaction_type, amount, balance_after, 
            source, description
          ) VALUES ($1, 'bonus', $2, $3, 'signup_bonus', 'Welcome signup bonus')`,
          [user.user_id, signupBonusAmount, signupBonusAmount]
        );

        // Update referrer's referral count (but NO coins yet)
        await client.query(
          `UPDATE user_profiles SET total_referrals = total_referrals + 1 WHERE user_id = $1`,
          [referrerId]
        );
      }

      // Store OTP
      await client.query(
        `INSERT INTO email_verifications (user_id, verification_token, expires_at, token_type)
         VALUES ($1, $2, $3, 'email_verification')`,
        [user.user_id, otp, expiresAt]
      );

      await client.query('COMMIT');

      // Send OTP email
      console.log(`📧 Sending OTP to ${email}: ${otp}`);
      sendVerificationOTP(email, fullName, otp).catch(err => {
        console.error('Email send failed:', err.message);
      });

      return successResponse(res, 201,
        signupBonusAmount > 0
          ? `🎉 Registration successful! You earned ${signupBonusAmount} coins! Check your email for verification code.`
          : '🎉 Registration successful! Check your email for the 6-digit verification code.',
        {
          userId: user.user_id,
          email: user.email,
          referralCode: user.referral_code,
          needsVerification: true,
          signupBonusEarned: signupBonusAmount, // User B ko mila
          referrerBonusPending: referrerId ? true : false // User A ko baad me milega
        }
      );

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Registration error:', error);
      return errorResponse(res, 500, 'Registration failed. Please try again.');
    } finally {
      client.release();
    }
  }


  // LOGIN WITH EMAIL
  static async login(req, res) {
    try {
      console.log("Hitted")
      const { email, password } = req.body;

      const user = await UserModel.findByEmail(email);

      if (!user) {
        return errorResponse(res, 401, 'Invalid email or password');
      }

      if (user.login_provider === 'email' && !user.email_verified) {
        return errorResponse(res, 403,
          '⚠️ Please verify your email before logging in.',
          { needsVerification: true, email: user.email }
        );
      }

      if (user.login_provider === 'google' && !user.password_hash) {
        return errorResponse(res, 400, 'Please login with Google');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        return errorResponse(res, 401, 'Invalid email or password');
      }

      const accessToken = generateAccessToken(user.user_id, user.email, user.role);
      const refreshToken = await generateRefreshToken(user.user_id);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
      });

      await UserModel.updateLastLogin(user.user_id);

      const { deviceType, deviceName } = parseUserAgent(req.headers['user-agent']);

      await pool.query(
        `INSERT INTO login_history (user_id, login_method, ip_address, device_type, device_name)
         VALUES ($1, 'email', $2, $3, $4)`,
        [user.user_id, req.ip, deviceType, deviceName]
      );

      const wallet = await WalletModel.getBalance(user.user_id);

      return successResponse(res, 200, '✅ Login successful', {
        user: {
          userId: user.user_id,
          email: user.email,
          fullName: user.full_name,
          profileImage: user.profile_image,
          emailVerified: user.email_verified,
          referralCode: user.referral_code,
          phone: user.phone,
          gender: user.gender,
          age: user.age,
          country: user.country,
          totalReferrals: user.total_referrals,
          totalArticlesRead: user.total_articles_read
        },
        wallet: {
          availableCoins: wallet?.available_coins || 0,
          totalEarned: wallet?.total_earned || 0,
          totalRedeemed: wallet?.total_redeemed || 0,
          referralEarnings: wallet?.referral_earnings || 0
        },
        tokens: {
          accessToken,
          refreshToken
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      return errorResponse(res, 500, 'Login failed. Please try again.');
    }
  }

  // ✅ VERIFY EMAIL - Supports both OLD token links and NEW OTP
  static async verifyEmail(req, res) {
    try {
      // OLD WAY: GET request with token query param
      if (req.method === 'GET' && req.query.token) {
        const { token } = req.query;

        const result = await pool.query(
          `SELECT * FROM email_verifications 
           WHERE verification_token = $1 
           AND token_type = 'email_verification'
           AND is_used = false 
           AND expires_at > NOW()`,
          [token]
        );

        if (result.rows.length === 0) {
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Verification Failed</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1>❌ Verification Failed</h1>
              <p>This link has expired or is invalid.</p>
              <p>Please request a new verification code from the app.</p>
            </body>
            </html>
          `);
        }

        const verification = result.rows[0];

        await pool.query('BEGIN');
        await UserModel.verifyEmail(verification.user_id);
        await pool.query(
          'UPDATE email_verifications SET is_used = true WHERE verification_id = $1',
          [verification.verification_id]
        );
        await pool.query('COMMIT');

        return res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>Email Verified</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>✅ Email Verified!</h1>
            <p>Your email has been successfully verified.</p>
            <p>You can now login to your account.</p>
          </body>
          </html>
        `);
      }

      // NEW WAY: POST request with email + OTP
      if (req.method === 'POST') {
        const { email, otp } = req.body;

        if (!email || !otp) {
          return errorResponse(res, 400, 'Email and OTP are required');
        }

        const user = await UserModel.findByEmail(email);

        if (!user) {
          return errorResponse(res, 404, 'User not found');
        }

        const result = await pool.query(
          `SELECT * FROM email_verifications 
           WHERE user_id = $1 
           AND verification_token = $2
           AND token_type = 'email_verification'
           AND is_used = false 
           AND expires_at > NOW()`,
          [user.user_id, otp]
        );

        if (result.rows.length === 0) {
          return errorResponse(res, 400,
            '❌ Invalid or expired OTP. Please request a new one.'
          );
        }

        const verification = result.rows[0];

        await pool.query('BEGIN');
        await UserModel.verifyEmail(verification.user_id);
        await pool.query(
          'UPDATE email_verifications SET is_used = true WHERE verification_id = $1',
          [verification.verification_id]
        );
        await pool.query('COMMIT');

        return successResponse(res, 200,
          '✅ Email verified successfully! You can now login.'
        );
      }

      return errorResponse(res, 400, 'Invalid verification request');

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Verification error:', error);
      return errorResponse(res, 500, 'Email verification failed');
    }
  }

  // ✅ RESEND OTP
  static async resendVerification(req, res) {
    try {
      const { email } = req.body;

      const user = await UserModel.findByEmail(email);

      if (!user) {
        return errorResponse(res, 404, 'User not found');
      }

      if (user.email_verified) {
        return errorResponse(res, 400, 'Email already verified');
      }

      // Rate limit check
      const recentOTP = await pool.query(
        `SELECT * FROM email_verifications 
         WHERE user_id = $1 
         AND token_type = 'email_verification'
         AND created_at > NOW() - INTERVAL '2 minutes'`,
        [user.user_id]
      );

      if (recentOTP.rows.length > 0) {
        return errorResponse(res, 429,
          '⏰ Please wait 2 minutes before requesting a new code.'
        );
      }

      // Mark old OTPs as used
      await pool.query(
        `UPDATE email_verifications 
         SET is_used = true 
         WHERE user_id = $1 AND token_type = 'email_verification'`,
        [user.user_id]
      );

      // Generate new OTP
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await pool.query(
        `INSERT INTO email_verifications (user_id, verification_token, expires_at, token_type)
         VALUES ($1, $2, $3, 'email_verification')`,
        [user.user_id, otp, expiresAt]
      );

      // Send email
      console.log(`📧 Resending OTP to ${email}: ${otp}`); // Debug log
      await sendVerificationOTP(email, user.full_name, otp);

      return successResponse(res, 200, '📧 Verification code sent successfully!');

    } catch (error) {
      console.error('Resend verification error:', error);
      return errorResponse(res, 500, 'Failed to resend verification code');
    }
  }

  // REQUEST PASSWORD RESET
  static async requestPasswordReset(req, res) {
    try {
      const { email } = req.body;
      const user = await UserModel.findByEmail(email);

      if (!user) {
        return successResponse(res, 200,
          'If your email is registered, you will receive a password reset link.'
        );
      }

      if (user.login_provider === 'google') {
        return errorResponse(res, 400,
          'This account uses Google login. Password reset is not available.'
        );
      }

      const resetToken = generateOTP();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO email_verifications (user_id, verification_token, expires_at, token_type)
         VALUES ($1, $2, $3, 'password_reset')`,
        [user.user_id, resetToken, expiresAt]
      );

      await sendPasswordResetEmail(email, user.full_name, resetToken);

      return successResponse(res, 200,
        'If your email is registered, you will receive a password reset link.'
      );

    } catch (error) {
      console.error('Password reset request error:', error);
      return errorResponse(res, 500, 'Failed to process password reset request');
    }
  }

  // RESET PASSWORD
  static async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      const result = await pool.query(
        `SELECT * FROM email_verifications 
         WHERE verification_token = $1 
         AND token_type = 'password_reset'
         AND is_used = false 
         AND expires_at > NOW()`,
        [token]
      );

      if (result.rows.length === 0) {
        return errorResponse(res, 400,
          'Invalid or expired reset token. Please request a new one.'
        );
      }

      const verification = result.rows[0];
      const passwordHash = await bcrypt.hash(newPassword, 10);

      await pool.query('BEGIN');
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE user_id = $2',
        [passwordHash, verification.user_id]
      );
      await pool.query(
        'UPDATE email_verifications SET is_used = true WHERE verification_id = $1',
        [verification.verification_id]
      );
      await pool.query(
        'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1',
        [verification.user_id]
      );
      await pool.query('COMMIT');

      return successResponse(res, 200,
        'Password reset successful! You can now login with your new password.'
      );

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Password reset error:', error);
      return errorResponse(res, 500, 'Password reset failed. Please try again.');
    }
  }

  // REFRESH TOKEN
  static async refreshToken(req, res) {
    try {
      let refreshToken;

      if (req.cookies && req.cookies.refreshToken) {
        refreshToken = req.cookies.refreshToken;
      }
      if (!refreshToken && req.body.refreshToken) {
        refreshToken = req.body.refreshToken;
      }
      if (!refreshToken && req.headers['x-refresh-token']) {
        refreshToken = req.headers['x-refresh-token'];
      }

      if (!refreshToken) {
        return errorResponse(res, 401, 'Refresh token not found!');
      }

      const { verifyRefreshToken } = await import('../utils/tokenUtils.js');
      const decoded = await verifyRefreshToken(refreshToken);

      if (!decoded) {
        return errorResponse(res, 401, 'Invalid or expired refresh token');
      }

      const user = await UserModel.findById(decoded.userId);

      if (!user) {
        return errorResponse(res, 404, 'User not found');
      }

      const newAccessToken = generateAccessToken(user.user_id, user.email, user.role);

      return successResponse(res, 200, 'Token refreshed successfully', {
        accessToken: newAccessToken
      });

    } catch (error) {
      console.error('Token refresh error:', error);
      return errorResponse(res, 500, 'Token refresh failed');
    }
  }

  // LOGOUT
  static async logout(req, res) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (refreshToken) {
        await pool.query(
          'UPDATE refresh_tokens SET is_revoked = true WHERE token = $1',
          [refreshToken]
        );
      }

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
      });

      return successResponse(res, 200, 'Logged out successfully');

    } catch (error) {
      console.error('Logout error:', error);
      return errorResponse(res, 500, 'Logout failed');
    }
  }
}

export default AuthController;