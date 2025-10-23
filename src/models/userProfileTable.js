import database from "../db/db.js";

export async function createUserProfileTable() {
  try {
    const query = `
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
    `;
    await database.query(query);
  } catch (error) {
    console.log("Failed to create user profile table", error);
    process.exit(1);
  }
}
