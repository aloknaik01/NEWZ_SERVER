//Referrals Table
import database from "../db/db.js";

export async function createReferalsTable() {
    try {
        const query = `
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
    `;
        await database.query(query);
    } catch (error) {
        console.log("Failed to create Referrals Table", error);
        process.exit(1);
    }
}
