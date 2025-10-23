import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import UserModel from '../models/userModel.js';
import WalletModel from '../models/walletModel.js';
import pool from './database.js';
import { generateReferralCode } from '../utils/helpers.js';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      const client = await pool.connect();
      
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;
        const fullName = profile.displayName;
        const profileImage = profile.photos[0]?.value || null;

        // Check if user exists with Google ID
        let user = await UserModel.findByGoogleId(googleId);

        if (user) {
          // Existing Google user
          return done(null, user);
        }

        // Check if user exists with same email (different provider)
        user = await UserModel.findByEmail(email);

        if (user) {
          // Link Google account to existing user
          await client.query(
            'UPDATE users SET google_id = $1, login_provider = $2 WHERE user_id = $3',
            [googleId, 'google', user.user_id]
          );

          const updatedUser = await UserModel.findById(user.user_id);
          return done(null, updatedUser);
        }

        // Create new user with Google
        await client.query('BEGIN');

        // Generate referral code
        const referralCode = await generateReferralCode();

        // Get referral code from session (if user came via referral link)
        const referredByCode = req.session?.referralCode || null;

        // Create user
        const newUserResult = await client.query(
          `INSERT INTO users (email, google_id, referral_code, referred_by_code, login_provider, email_verified)
           VALUES ($1, $2, $3, $4, 'google', true)
           RETURNING user_id, email, referral_code, google_id`,
          [email, googleId, referralCode, referredByCode]
        );

        const newUser = newUserResult.rows[0];

        // Create profile
        await client.query(
          `INSERT INTO user_profiles (user_id, full_name, profile_image, country)
           VALUES ($1, $2, $3, 'India')`,
          [newUser.user_id, fullName, profileImage]
        );

        // Create wallet
        await client.query(
          `INSERT INTO user_wallets (user_id) VALUES ($1)`,
          [newUser.user_id]
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
              `INSERT INTO referrals (referrer_user_id, referred_user_id, referral_code, signup_bonus_coins, signup_bonus_given)
               VALUES ($1, $2, $3, $4, true)`,
              [referrerId, newUser.user_id, referredByCode, bonusAmount]
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
          }
        }

        await client.query('COMMIT');

        const completeUser = await UserModel.findById(newUser.user_id);
        return done(null, completeUser);

      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Google OAuth error:', error);
        return done(error, null);
      } finally {
        client.release();
      }
    }
  )
);

// Serialize user
passport.serializeUser((user, done) => {
  done(null, user.user_id);
});

// Deserialize user
passport.deserializeUser(async (userId, done) => {
  try {
    const user = await UserModel.findById(userId);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;