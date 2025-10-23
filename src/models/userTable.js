import database from "../db/db.js";

export async function createUserTable() {
  try {
    const query = `
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
    `;
    await database.query(query);
  } catch (error) {
    console.log("Failed to create user table", error);
    process.exit(1);
  }
}
