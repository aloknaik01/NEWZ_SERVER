import UserModel from '../models/userModel.js';
import WalletModel from '../models/walletModel.js';
import pool from '../config/database.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';

class UserController {
  // GET USER PROFILE
  static async getProfile(req, res) {
    try {
      const userId = req.user.userId;

      // Get complete profile with wallet
      const user = await UserModel.getCompleteProfile(userId);

      if (!user) {
        return errorResponse(res, 404, 'User not found');
      }

      // Get referral stats
      const referralStats = await pool.query(
        `SELECT 
          COUNT(*) as total_referrals,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_referrals,
          COALESCE(SUM(lifetime_commission_earned), 0) as total_referral_earnings
         FROM referrals
         WHERE referrer_user_id = $1`,
        [userId]
      );

      const stats = referralStats.rows[0];

      // Format response
      const profileData = {
        user: {
          userId: user.user_id,
          email: user.email,
          emailVerified: user.email_verified,
          loginProvider: user.login_provider,
          accountStatus: user.account_status,
          role: user.role,
          createdAt: user.created_at,
          lastLogin: user.last_login
        },
        profile: {
          fullName: user.full_name,
          profileImage: user.profile_image,
          gender: user.gender,
          age: user.age,
          phone: user.phone,
          country: user.country,
          totalArticlesRead: user.total_articles_read
        },
        wallet: {
          availableCoins: user.available_coins || 0,
          totalEarned: user.total_earned || 0,
          totalRedeemed: user.total_redeemed || 0,
          referralEarnings: user.referral_earnings || 0
        },
        referral: {
          myReferralCode: user.referral_code,
          referredByCode: user.referred_by_code,
          totalReferrals: parseInt(stats.total_referrals),
          activeReferrals: parseInt(stats.active_referrals),
          totalReferralEarnings: parseInt(stats.total_referral_earnings),
          referralLink: `${process.env.FRONTEND_URL}/register?ref=${user.referral_code}`
        }
      };

      return successResponse(res, 200, 'Profile fetched successfully', profileData);

    } catch (error) {
      console.error('Get profile error:', error);
      return errorResponse(res, 500, 'Failed to fetch profile');
    }
  }

  // UPDATE USER PROFILE
  static async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
      const { fullName, gender, age, phone, profileImage } = req.body;

      // Validation
      if (age && (age < 13 || age > 120)) {
        return errorResponse(res, 400, 'Age must be between 13 and 120');
      }

      if (gender && !['male', 'female', 'other'].includes(gender)) {
        return errorResponse(res, 400, 'Invalid gender value');
      }

      // Check if phone already exists (if updating phone)
      if (phone) {
        const existingPhone = await pool.query(
          'SELECT user_id FROM user_profiles WHERE phone = $1 AND user_id != $2',
          [phone, userId]
        );

        if (existingPhone.rows.length > 0) {
          return errorResponse(res, 400, 'Phone number already registered');
        }
      }

      // Update profile
      const updatedProfile = await UserModel.updateProfile(userId, {
        fullName,
        gender,
        age,
        phone,
        profileImage
      });

      return successResponse(res, 200, 'Profile updated successfully', updatedProfile);

    } catch (error) {
      console.error('Update profile error:', error);
      return errorResponse(res, 500, 'Failed to update profile');
    }
  }

  // GET MY REFERRALS
  static async getMyReferrals(req, res) {
    try {
      const userId = req.user.userId;

      const result = await pool.query(
        `SELECT 
          r.referral_id,
          r.referred_at,
          r.signup_bonus_coins,
          r.lifetime_commission_earned,
          r.status,
          u.email as referred_email,
          p.full_name as referred_name,
          p.profile_image as referred_image,
          p.total_articles_read as referred_articles_read,
          w.available_coins as referred_balance
         FROM referrals r
         JOIN users u ON r.referred_user_id = u.user_id
         JOIN user_profiles p ON r.referred_user_id = p.user_id
         LEFT JOIN user_wallets w ON r.referred_user_id = w.user_id
         WHERE r.referrer_user_id = $1
         ORDER BY r.referred_at DESC`,
        [userId]
      );

      return successResponse(res, 200, 'Referrals fetched successfully', {
        totalReferrals: result.rows.length,
        referrals: result.rows
      });

    } catch (error) {
      console.error('Get referrals error:', error);
      return errorResponse(res, 500, 'Failed to fetch referrals');
    }
  }

  // GET WALLET DETAILS
  static async getWallet(req, res) {
    try {
      const userId = req.user.userId;

      const wallet = await WalletModel.getBalance(userId);

      if (!wallet) {
        return errorResponse(res, 404, 'Wallet not found');
      }

      return successResponse(res, 200, 'Wallet details fetched successfully', wallet);

    } catch (error) {
      console.error('Get wallet error:', error);
      return errorResponse(res, 500, 'Failed to fetch wallet details');
    }
  }

  // GET LOGIN HISTORY
  static async getLoginHistory(req, res) {
    try {
      const userId = req.user.userId;
      const limit = parseInt(req.query.limit) || 10;

      const result = await pool.query(
        `SELECT login_id, device_type, device_name, ip_address, city, country, login_method, login_at
         FROM login_history
         WHERE user_id = $1
         ORDER BY login_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return successResponse(res, 200, 'Login history fetched successfully', {
        totalLogins: result.rows.length,
        loginHistory: result.rows
      });

    } catch (error) {
      console.error('Get login history error:', error);
      return errorResponse(res, 500, 'Failed to fetch login history');
    }
  }
}

export default UserController;