import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import conf from '../config/conf.js';

// Generate Access Token (short-lived)
export const generateAccessToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role },
    conf.jwt.secretKey,
    { expiresIn: conf.jwt.expires || '120m' }
  );
};

// Generate Refresh Token (long-lived)
export const generateRefreshToken = async (userId) => {
  const token = jwt.sign(
    { userId },
    conf.jwt.refreshKey,
    { expiresIn: conf.jwt.refreshExpires || '7d' }
  );

  // Store in database
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) 
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );

  return token;
};

// Verify Access Token
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (error) {
    return null;
  }
};

// Verify Refresh Token
export const verifyRefreshToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // Check if token exists and not revoked
    const result = await pool.query(
      `SELECT * FROM refresh_tokens 
       WHERE token = $1 AND is_revoked = false AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) return null;
    return decoded;
  } catch (error) {
    return null;
  }
};

// Revoke Refresh Token
export const revokeRefreshToken = async (token) => {
  await pool.query(
    `UPDATE refresh_tokens SET is_revoked = true WHERE token = $1`,
    [token]
  );
};