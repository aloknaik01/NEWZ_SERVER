import database from "../db/db.js";

export async function createUserWalletsTable() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS user_wallets (
        user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        available_coins BIGINT DEFAULT 0 CHECK (available_coins >= 0),
        total_earned BIGINT DEFAULT 0,
        total_redeemed BIGINT DEFAULT 0,
        referral_earnings BIGINT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await database.query(query);
  } catch (error) {
    console.log("Failed to create refresh Token  table", error);
    process.exit(1);
  }
}
