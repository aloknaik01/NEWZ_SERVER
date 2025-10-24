import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import UserModel from '../models/userModel.js';
import WalletModel from '../models/walletModel.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
import { generateReferralCode, generateVerificationToken, parseUserAgent } from '../utils/helpers.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/emailService.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';

class AuthController {
  // REGISTER WITH EMAIL
  static async register(req, res) {
    const client = await pool.connect();
    
    try {
      const { email, password, fullName, referredByCode } = req.body;

      // Check if user exists
      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        return errorResponse(res, 400, 'Email already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Generate referral code
      const referralCode = await generateReferralCode();

      // Start transaction
      await client.query('BEGIN');

      // Create user
      const newUser = await client.query(
        `INSERT INTO users (email, password_hash, referral_code, referred_by_code, login_provider)
         VALUES ($1, $2, $3, $4, 'email')
         RETURNING user_id, email, referral_code`,
        [email.toLowerCase(), passwordHash, referralCode, referredByCode || null]
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

      // Handle referral bonus
      if (referredByCode) {
        const referrer = await client.query(
          'SELECT user_id FROM users WHERE referral_code = $1',
          [referredByCode]
        );

        if (referrer.rows.length > 0) {
          const referrerId = referrer.rows[0].user_id;
          const bonusAmount = parseInt(process.env.REFERRAL_SIGNUP_BONUS || 100);

          // Create referral record
          await client.query(
            `INSERT INTO referrals (referrer_user_id, referred_user_id, referral_code, signup_bonus_coins)
             VALUES ($1, $2, $3, $4)`,
            [referrerId, user.user_id, referredByCode, bonusAmount]
          );

          // Give bonus to referrer
          await client.query(
            `UPDATE user_wallets 
             SET available_coins = available_coins + $2,
                 total_earned = total_earned + $2,
                 referral_earnings = referral_earnings + $2
             WHERE user_id = $1`,
            [referrerId, bonusAmount]
          );

          // Update referral count
          await client.query(
            `UPDATE user_profiles SET total_referrals = total_referrals + 1 WHERE user_id = $1`,
            [referrerId]
          );

          // Mark bonus as given
          await client.query(
            `UPDATE referrals SET signup_bonus_given = true 
             WHERE referrer_user_id = $1 AND referred_user_id = $2`,
            [referrerId, user.user_id]
          );
        }
      }

      // Generate verification token
      const verificationToken = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await client.query(
        `INSERT INTO email_verifications (user_id, verification_token, expires_at, token_type)
         VALUES ($1, $2, $3, 'email_verification')`,
        [user.user_id, verificationToken, expiresAt]
      );

      await client.query('COMMIT');

      // Send verification email (async, don't wait)
      sendVerificationEmail(email, fullName, verificationToken).catch(err => {
        console.error('Email send failed:', err.message);
      });

      return successResponse(res, 201, 
        'Registration successful! Please check your email to verify your account.', 
        {
          userId: user.user_id,
          email: user.email,
          referralCode: user.referral_code
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
      const { email, password } = req.body;

      // Find user
      const user = await UserModel.findByEmail(email);

      if (!user) {
        return errorResponse(res, 401, 'Invalid email or password');
      }

      // Check email verification
      if (user.login_provider === 'email' && !user.email_verified) {
        return errorResponse(res, 403, 
          'Please verify your email before logging in. Check your inbox for the verification link.', 
          { needsVerification: true, email: user.email }
        );
      }

      // Check if user registered with Google
      if (user.login_provider === 'google' && !user.password_hash) {
        return errorResponse(res, 400, 'Please login with Google');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        return errorResponse(res, 401, 'Invalid email or password');
      }

      // Generate tokens
      const accessToken = generateAccessToken(user.user_id, user.email, user.role);
      const refreshToken = await generateRefreshToken(user.user_id);

      // Update last login
      await UserModel.updateLastLogin(user.user_id);

      // Log login history
      const { deviceType, deviceName } = parseUserAgent(req.headers['user-agent']);
      
      await pool.query(
        `INSERT INTO login_history (user_id, login_method, ip_address, device_type, device_name)
         VALUES ($1, 'email', $2, $3, $4)`,
        [user.user_id, req.ip, deviceType, deviceName]
      );

      // Get wallet info
      const wallet = await WalletModel.getBalance(user.user_id);

      return successResponse(res, 200, 'Login successful', {
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

  // VERIFY EMAIL
  static async verifyEmail(req, res) {
    try {
      const { token } = req.query;

      if (!token) {
        return errorResponse(res, 400, 'Verification token is required');
      }

      // Find token
      const result = await pool.query(
        `SELECT * FROM email_verifications 
         WHERE verification_token = $1 
         AND token_type = 'email_verification'
         AND is_used = false 
         AND expires_at > NOW()`,
        [token]
      );

      if (result.rows.length === 0) {
        return errorResponse(res, 400, 
          'Invalid or expired verification token. Please request a new one.'
        );
      }

      const verification = result.rows[0];

      // Start transaction
      await pool.query('BEGIN');

      // Update user email_verified status
      await UserModel.verifyEmail(verification.user_id);

      // Mark token as used
      await pool.query(
        'UPDATE email_verifications SET is_used = true WHERE verification_id = $1',
        [verification.verification_id]
      );

      await pool.query('COMMIT');

      return successResponse(res, 200, 
        'Email verified successfully! You can now login to your account.'
      );

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Verification error:', error);
      return errorResponse(res, 500, 'Email verification failed. Please try again.');
    }
  }

  // RESEND VERIFICATION EMAIL
  static async resendVerification(req, res) {
    try {
      const { email } = req.body;

      // Find user
      const user = await UserModel.findByEmail(email);

      if (!user) {
        return errorResponse(res, 404, 'User not found');
      }

      if (user.email_verified) {
        return errorResponse(res, 400, 'Email already verified');
      }

      // Check rate limit (manual check - additional to middleware)
      const recentToken = await pool.query(
        `SELECT * FROM email_verifications 
         WHERE user_id = $1 
         AND token_type = 'email_verification'
         AND created_at > NOW() - INTERVAL '2 minutes'`,
        [user.user_id]
      );

      if (recentToken.rows.length > 0) {
        return errorResponse(res, 429, 
          'Verification email already sent. Please check your inbox or wait 2 minutes.'
        );
      }

      // Mark old tokens as used
      await pool.query(
        `UPDATE email_verifications 
         SET is_used = true 
         WHERE user_id = $1 AND token_type = 'email_verification'`,
        [user.user_id]
      );

      // Generate new token
      const verificationToken = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO email_verifications (user_id, verification_token, expires_at, token_type)
         VALUES ($1, $2, $3, 'email_verification')`,
        [user.user_id, verificationToken, expiresAt]
      );

      // Send email
      await sendVerificationEmail(email, user.full_name, verificationToken);

      return successResponse(res, 200, 'Verification email sent successfully');

    } catch (error) {
      console.error('Resend verification error:', error);
      return errorResponse(res, 500, 'Failed to resend verification email');
    }
  }

  // REQUEST PASSWORD RESET
  static async requestPasswordReset(req, res) {
    try {
      const { email } = req.body;

      // Find user
      const user = await UserModel.findByEmail(email);

      // Always return success (security - don't reveal if email exists)
      if (!user) {
        return successResponse(res, 200, 
          'If your email is registered, you will receive a password reset link.'
        );
      }

      // Check if Google user
      if (user.login_provider === 'google') {
        return errorResponse(res, 400, 
          'This account uses Google login. Password reset is not available.'
        );
      }

      // Generate reset token
      const resetToken = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await pool.query(
        `INSERT INTO email_verifications (user_id, verification_token, expires_at, token_type)
         VALUES ($1, $2, $3, 'password_reset')`,
        [user.user_id, resetToken, expiresAt]
      );

      // Send email
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

      // Find token
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

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Start transaction
      await pool.query('BEGIN');

      // Update password
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE user_id = $2',
        [passwordHash, verification.user_id]
      );

      // Mark token as used
      await pool.query(
        'UPDATE email_verifications SET is_used = true WHERE verification_id = $1',
        [verification.verification_id]
      );

      // Revoke all refresh tokens for security
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

  // REFRESH ACCESS TOKEN
  static async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return errorResponse(res, 400, 'Refresh token is required');
      }

      const { verifyRefreshToken } = await import('../utils/tokenUtils.js');
      const decoded = await verifyRefreshToken(refreshToken);

      if (!decoded) {
        return errorResponse(res, 401, 'Invalid or expired refresh token');
      }

      // Get user info
      const user = await UserModel.findById(decoded.userId);

      if (!user) {
        return errorResponse(res, 404, 'User not found');
      }

      // Generate new access token
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
      const { refreshToken } = req.body;

      if (refreshToken) {
        await pool.query(
          'UPDATE refresh_tokens SET is_revoked = true WHERE token = $1',
          [refreshToken]
        );
      }

      return successResponse(res, 200, 'Logged out successfully');

    } catch (error) {
      console.error('Logout error:', error);
      return errorResponse(res, 500, 'Logout failed');
    }
  }
}

export default AuthController;