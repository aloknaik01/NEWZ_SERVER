

import database from "../db/db.js";

export async function createRefreshToeknTable() {
    try {
        const query = `
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
    `;
        await database.query(query);
    } catch (error) {
        console.log("Failed to create refresh Token  table", error);
        process.exit(1);
    }
}
