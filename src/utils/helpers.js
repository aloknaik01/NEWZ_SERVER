import crypto from 'crypto';
import pool from '../config/database.js';

// Generate unique referral code
export const generateReferralCode = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;

  while (!isUnique) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Check uniqueness
    const result = await pool.query(
      'SELECT referral_code FROM users WHERE referral_code = $1',
      [code]
    );
    
    if (result.rows.length === 0) {
      isUnique = true;
    }
  }

  return code;
};

// Generate verification token
export const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Get device info from user-agent
export const parseUserAgent = (userAgent) => {
  if (!userAgent) return { deviceType: 'unknown', deviceName: 'Unknown Device' };

  if (userAgent.includes('Android')) {
    return { deviceType: 'android', deviceName: 'Android Device' };
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    return { deviceType: 'ios', deviceName: 'iOS Device' };
  } else {
    return { deviceType: 'web', deviceName: 'Web Browser' };
  }
};