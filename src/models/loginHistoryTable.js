

import database from "../db/db.js";

export async function createLoginHistoryTable() {
    try {
        const query = `
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
    `;
        await database.query(query);
    } catch (error) {
        console.log("Failed to create login history table", error);
        process.exit(1);
    }
}
