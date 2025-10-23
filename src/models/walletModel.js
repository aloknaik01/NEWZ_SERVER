import pool from '../config/database.js';

class WalletModel {
    // Create wallet for new user
    static async create(userId) {
        const query = `
      INSERT INTO user_wallets (user_id)
      VALUES ($1)
      RETURNING *
    `;

        const result = await pool.query(query, [userId]);
        return result.rows[0];
    }

    // Get wallet balance
    static async getBalance(userId) {
        const query = 'SELECT * FROM user_wallets WHERE user_id = $1';
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    }

    // Add referral bonus
    static async addReferralBonus(userId, amount) {
        const query = `
      UPDATE user_wallets
      SET available_coins = available_coins + $2,
          total_earned = total_earned + $2,
          referral_earnings = referral_earnings + $2,
          updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `;

        const result = await pool.query(query, [userId, amount]);
        return result.rows[0];
    }
}

export default WalletModel;