import database from '../../db/db.js';

class UserModel {
  // Create new user
  static async create(userData) {
    const { email, passwordHash, referralCode, referredByCode, loginProvider, googleId } = userData;
    
    const query = `
      INSERT INTO users (email, password_hash, referral_code, referred_by_code, login_provider, google_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING user_id, email, referral_code, login_provider, email_verified, created_at
    `;
    
    const values = [email, passwordHash, referralCode, referredByCode, loginProvider, googleId];
    const result = await database.query(query, values);
    return result.rows[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const query = `
      SELECT u.*, p.full_name, p.profile_image, p.gender, p.age, p.phone, p.country,
             p.total_referrals, p.total_articles_read
      FROM users u
      LEFT JOIN user_profiles p ON u.user_id = p.user_id
      WHERE u.email = $1 AND u.account_status = 'active'
    `;
    
    const result = await database.query(query, [email.toLowerCase()]);
    return result.rows[0] || null;
  }

  // Find user by ID
  static async findById(userId) {
    const query = `
      SELECT u.*, p.full_name, p.profile_image, p.gender, p.age, p.phone, p.country,
             p.total_referrals, p.total_articles_read
      FROM users u
      LEFT JOIN user_profiles p ON u.user_id = p.user_id
      WHERE u.user_id = $1 AND u.account_status = 'active'
    `;
    
    const result = await database.query(query, [userId]);
    return result.rows[0] || null;
  }

  // Find user by Google ID
  static async findByGoogleId(googleId) {
    const query = `
      SELECT u.*, p.full_name, p.profile_image, p.gender, p.age, p.phone, p.country
      FROM users u
      LEFT JOIN user_profiles p ON u.user_id = p.user_id
      WHERE u.google_id = $1 AND u.account_status = 'active'
    `;
    
    const result = await database.query(query, [googleId]);
    return result.rows[0] || null;
  }

  // Get complete user profile
  static async getCompleteProfile(userId) {
    const query = `
      SELECT 
        u.user_id,
        u.email,
        u.email_verified,
        u.referral_code,
        u.referred_by_code,
        u.login_provider,
        u.account_status,
        u.role,
        u.created_at,
        u.last_login,
        p.full_name,
        p.profile_image,
        p.gender,
        p.age,
        p.phone,
        p.country,
        p.total_referrals,
        p.total_articles_read,
        w.available_coins,
        w.total_earned,
        w.total_redeemed,
        w.referral_earnings
      FROM users u
      LEFT JOIN user_profiles p ON u.user_id = p.user_id
      LEFT JOIN user_wallets w ON u.user_id = w.user_id
      WHERE u.user_id = $1 AND u.account_status = 'active'
    `;
    
    const result = await database.query(query, [userId]);
    return result.rows[0] || null;
  }

  // Update last login
  static async updateLastLogin(userId) {
    await database.query(
      'UPDATE users SET last_login = NOW() WHERE user_id = $1',
      [userId]
    );
  }

  // Verify email
  static async verifyEmail(userId) {
    await database.query(
      'UPDATE users SET email_verified = true WHERE user_id = $1',
      [userId]
    );
  }

  // Update profile
  static async updateProfile(userId, profileData) {
    const { fullName, gender, age, phone, profileImage } = profileData;
    
    const query = `
      UPDATE user_profiles
      SET full_name = COALESCE($2, full_name),
          gender = COALESCE($3, gender),
          age = COALESCE($4, age),
          phone = COALESCE($5, phone),
          profile_image = COALESCE($6, profile_image),
          updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `;
    
    const result = await database.query(query, [userId, fullName, gender, age, phone, profileImage]);
    return result.rows[0];
  }
}

export default UserModel;