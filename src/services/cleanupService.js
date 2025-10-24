import cron from 'node-cron';
import pool from '../config/database.js';

// Cleanup expired tokens - runs daily at 3 AM
export const startCleanupService = () => {
  cron.schedule('0 3 * * *', async () => {
    try {
      console.log('Starting token cleanup...');
      
      const result = await pool.query(
        `DELETE FROM email_verifications 
         WHERE expires_at < NOW() 
         AND is_used = false`
      );
      
      console.log(`Cleaned up ${result.rowCount} expired tokens`);
    } catch (error) {
      console.error('Token cleanup failed:', error.message);
    }
  });
  
  console.log('Cleanup service started (runs daily at 3 AM)');
};

// Manual cleanup function
export const cleanupExpiredTokens = async () => {
  try {
    const result = await pool.query(
      `DELETE FROM email_verifications 
       WHERE expires_at < NOW()`
    );
    
    return result.rowCount;
  } catch (error) {
    console.error('Cleanup error:', error.message);
    throw error;
  }
};