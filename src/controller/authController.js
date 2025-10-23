import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import UserModel from '../models/userModel.js';
import WalletModel from '../models/walletModel.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
import { generateReferralCode, generateVerificationToken, parseUserAgent } from '../utils/helpers.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';

class AuthController {
  // REGISTER WITH EMAIL
  static async register(req, res) {
    const client = await pool.connect();
    
    try {
      const { email, password, fullName, referredByCode } = req.body;

      // Validation
      if (!email || !password || !fullName) {
        return errorResponse(res, 400, 'Email, password, and full name are required');
      }

      if (password.length < 6) {
        return errorResponse(res, 400, 'Password must be at least 6 characters');
      }

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

      // Create email verification token
      const verificationToken = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await client.query(
        `INSERT INTO email_verifications (user_id, verification_token, expires_at, token_type)
         VALUES ($1, $2, $3, 'email_verification')`,
        [user.user_id, verificationToken, expiresAt]
      );

      await client.query('COMMIT');

      // TODO: Send verification email (implement later)
      const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

      return successResponse(res, 201, 'Registration successful! Please verify your email.', {
        userId: user.user_id,
        email: user.email,
        referralCode: user.referral_code,
        verificationLink // Remove in production
      });

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

      if (!email || !password) {
        return errorResponse(res, 400, 'Email and password are required');
      }

      // Find user
      const user = await UserModel.findByEmail(email);

      if (!user) {
        return errorResponse(res, 401, 'Invalid email or password');
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

      // Find verification token
      const result = await pool.query(
        `SELECT * FROM email_verifications 
         WHERE verification_token = $1 
         AND token_type = 'email_verification'
         AND is_used = false 
         AND expires_at > NOW()`,
        [token]
      );

      if (result.rows.length === 0) {
        return errorResponse(res, 400, 'Invalid or expired verification token');
      }

      const verification = result.rows[0];

      // Update user email_verified status
      await UserModel.verifyEmail(verification.user_id);

      // Mark token as used
      await pool.query(
        'UPDATE email_verifications SET is_used = true WHERE verification_id = $1',
        [verification.verification_id]
      );

      return successResponse(res, 200, 'Email verified successfully!');

    } catch (error) {
      console.error('Verification error:', error);
      return errorResponse(res, 500, 'Verification failed');
    }
  }

}


        