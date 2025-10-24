import pool from '../config/database.js';


export async function createAllTables() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT,
        login_provider VARCHAR(20) DEFAULT 'email' CHECK (login_provider IN ('email', 'google')),
        google_id VARCHAR(255) UNIQUE,
        email_verified BOOLEAN DEFAULT false,
        referral_code VARCHAR(10) UNIQUE NOT NULL,
        referred_by_code VARCHAR(10),
        account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted')),
        role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code);
      CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
    `);

    // 2. User Profiles Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        full_name VARCHAR(100) NOT NULL,
        profile_image TEXT,
        gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
        age INT CHECK (age >= 13 AND age <= 120),
        phone VARCHAR(15),
        country VARCHAR(50) DEFAULT 'India',
        total_referrals INT DEFAULT 0,
        total_articles_read INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_profiles_phone ON user_profiles(phone);
    `);

    // 3. Email Verifications Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        verification_id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        verification_token VARCHAR(64) UNIQUE NOT NULL,
        token_type VARCHAR(30) DEFAULT 'email_verification' CHECK (token_type IN ('email_verification', 'password_reset')),
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_verification_token ON email_verifications(verification_token);
    `);

    // 4. Refresh Tokens Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_refresh_token ON refresh_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
    `);

    // 5. User Wallets Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_wallets (
        user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        available_coins BIGINT DEFAULT 0 CHECK (available_coins >= 0),
        total_earned BIGINT DEFAULT 0,
        total_redeemed BIGINT DEFAULT 0,
        referral_earnings BIGINT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Referrals Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        referral_id SERIAL PRIMARY KEY,
        referrer_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        referred_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        referral_code VARCHAR(10) NOT NULL,
        signup_bonus_given BOOLEAN DEFAULT false,
        signup_bonus_coins INT DEFAULT 100,
        lifetime_commission_earned BIGINT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
        referred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        first_activity_at TIMESTAMP,
        UNIQUE (referrer_user_id, referred_user_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);
    `);

    // 7. Login History Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_history (
        login_id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        device_type VARCHAR(20),
        device_name VARCHAR(100),
        ip_address VARCHAR(45),
        city VARCHAR(100),
        country VARCHAR(100) DEFAULT 'India',
        login_method VARCHAR(20) CHECK (login_method IN ('email', 'google')),
        login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_login_user ON login_history(user_id, login_at);
    `);

    await client.query('COMMIT');
    console.log('All tables created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
}