import cron from 'node-cron';
import NewsService from './newsService.js';

export const startNewsSyncCron = () => {
    console.log('Initializing News Sync Cron Job...');

    // Run immediately on startup
    console.log('Running initial sync...');
    NewsService.syncAllCategories()
        .then(() => console.log('Initial sync completed'))
        .catch(err => console.error('Initial sync failed:', err));

    // Schedule: Every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`CRON TRIGGERED - ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log('='.repeat(60));

        try {
            await NewsService.syncAllCategories();
            console.log('Cron sync completed successfully');
        } catch (error) {
            console.error('Cron sync failed:', error);
        }
    });

    console.log('Cron job started (runs every 30 minutes)');
    console.log('Next run: ' + new Date(Date.now() + 30 * 60 * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
};