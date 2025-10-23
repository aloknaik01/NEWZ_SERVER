import database from "../db/db.js";

export async function createEmailVerificationTable() {
    try {
        const query = `
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
    `;
        await database.query(query);
    } catch (error) {
        console.log("Failed to create Email Verification  table", error);
        process.exit(1);
    }
}
