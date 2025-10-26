import dotenv from 'dotenv';
import app from './src/app.js';
import pool from './src/config/database.js';
import { createAllTables } from './src/database/schema.js';
import { testEmailConnection } from './src/utils/emailService.js';
import { startCleanupService } from './src/services/cleanupService.js';
import { createNewsArticlesTables } from './src/database/newsSchema.js';
import { startNewsSyncCron } from './src/services/newsCronService.js';
import NewsCleanupService from './src/services/newsCleanupService.js';


dotenv.config();

const PORT = process.env.PORT || 5000;

// Initialize application
async function initializeApp() {
  try {
    console.log('Starting server initialization...\n');

    // 1. Test database connection
    await pool.query('SELECT NOW()');
    console.log('Database connection successful');

    // 2. Create/update tables
    await createAllTables();

    // 3. Create/update news tables
    await createNewsArticlesTables();

    // 4. Test email service
    const emailReady = await testEmailConnection();
    if (!emailReady) {
      console.warn('Email service not configured. Some features may not work.');
    }

    // 5. Start cleanup service
    startCleanupService();

    // 6. Start news sync cron 
    startNewsSyncCron();

    //7. News article every day at 12:00 am
    NewsCleanupService.startDailyNewsCleanup();

    //7. News article Artice every Month 1st day at 12:00 am
    NewsCleanupService.startMonthlyHistoryCleanup();


    console.log('\n Application initialized successfully\n');
    return true;
  } catch (error) {
    console.error('Application initialization failed:', error);
    return false;
  }
}

// Start server
async function startServer() {
  const initialized = await initializeApp();

  if (!initialized) {
    console.error('Server startup aborted due to initialization failure');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
    console.log(`News Cron: Every 30 minutes  `);
    console.log(`News Cleanup: Daily at 12:00 AM `);
    console.log(`History Cleanup: Monthly 1st 12:01 AM `);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
}

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    await pool.end();
    console.log('Database connections closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
startServer();