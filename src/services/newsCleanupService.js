import cron from 'node-cron';
import pool from '../config/database.js';

class NewsCleanupService {
    // Delete all news articles daily at 12:00 AM
    static startDailyNewsCleanup() {
        // Cron: 0 0 * * * (Every day at 12:00 AM)
        cron.schedule('0 0 * * *', async () => {
            try {
                console.log('\n ===== DAILY NEWS CLEANUP STARTED =====');
                console.log(`Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

                // Delete all news articles
                const result = await pool.query(
                    'DELETE FROM news_articles WHERE TRUE RETURNING article_id'
                );

                console.log(`Deleted ${result.rowCount} news articles`);

                // Reset fetch tracking
                await pool.query(
                    `UPDATE news_fetch_tracking 
           SET total_articles_fetched = 0,
               articles_in_current_batch = 0,
               updated_at = NOW()`
                );

                // Clean fetch logs older than 30 days
                const logsResult = await pool.query(
                    `DELETE FROM news_fetch_logs 
           WHERE fetched_at < NOW() - INTERVAL '30 days'`
                );

                console.log(`Deleted ${logsResult.rowCount} old fetch logs`);
                console.log('===== DAILY NEWS CLEANUP COMPLETED =====\n');

            } catch (error) {
                console.error(' Daily news cleanup failed:', error);
            }
        });

        console.log('Daily news cleanup scheduled (runs at 12:00 AM every day)');
    }

    // Delete reading history monthly at 12:01 AM on 1st
    static startMonthlyHistoryCleanup() {
        // Cron: 1 0 1 * * (Every month 1st at 12:01 AM)
        cron.schedule('1 0 1 * *', async () => {
            try {
                console.log('\n===== MONTHLY HISTORY CLEANUP STARTED =====');
                console.log(`Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

                // Delete all reading history
                const historyResult = await pool.query(
                    'DELETE FROM reading_history WHERE TRUE'
                );

                console.log(`Deleted ${historyResult.rowCount} reading history records`);

                // Delete all daily reading stats
                const statsResult = await pool.query(
                    'DELETE FROM daily_reading_stats WHERE TRUE'
                );

                console.log(`Deleted ${statsResult.rowCount} daily stats records`);

                // Reset user profile reading counts (optional - keep or remove)
                await pool.query(
                    `UPDATE user_profiles 
           SET total_articles_read = 0,
               current_streak = 0,
               updated_at = NOW()`
                );

                console.log('Reset user reading counts');
                console.log('===== MONTHLY HISTORY CLEANUP COMPLETED =====\n');

            } catch (error) {
                console.error('Monthly history cleanup failed:', error);
            }
        });

        console.log('Monthly history cleanup scheduled (runs at 12:01 AM on 1st of every month)');
    }

    // Manual cleanup (for testing)
    static async cleanNewsNow() {
        try {
            const result = await pool.query('DELETE FROM news_articles');
            console.log(`Manually deleted ${result.rowCount} news articles`);
            return result.rowCount;
        } catch (error) {
            console.error('Manual cleanup failed:', error);
            throw error;
        }
    }

    static async cleanHistoryNow() {
        try {
            const historyResult = await pool.query('DELETE FROM reading_history');
            const statsResult = await pool.query('DELETE FROM daily_reading_stats');

            console.log(`Manually deleted ${historyResult.rowCount} history records`);
            console.log(`Manually deleted ${statsResult.rowCount} stats records`);

            return {
                history: historyResult.rowCount,
                stats: statsResult.rowCount
            };
        } catch (error) {
            console.error('Manual history cleanup failed:', error);
            throw error;
        }
    }
}

export default NewsCleanupService;