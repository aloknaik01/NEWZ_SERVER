// src/controllers/newsController.js
import pool from '../config/database.js';
import NewsService from '../services/newsService.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';

class NewsController {
  // Get news articles
  static async getNews(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        category = 'all',
        language = 'english'
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const countResult = await pool.query(
        `SELECT COUNT(*) as total 
         FROM news_articles 
         WHERE is_active = true AND language = $1 AND category = $2`,
        [language, category]
      );

      const totalArticles = parseInt(countResult.rows[0].total);

      const result = await pool.query(
        `SELECT 
          id, article_id, title, description, link, 
          image_url, video_url,
          source_name, source_icon, creator, 
          category, keywords, pub_date, 
          view_count, read_count, coins_reward,
          page_number
        FROM news_articles
        WHERE is_active = true
          AND language = $1
          AND category = $2
        ORDER BY pub_date DESC
        LIMIT $3 OFFSET $4`,
        [language, category, parseInt(limit), offset]
      );

      if (result.rows.length > 0) {
        const articleIds = result.rows.map(a => a.id);
        await pool.query(
          `UPDATE news_articles 
           SET view_count = view_count + 1 
           WHERE id = ANY($1::int[])`,
          [articleIds]
        );
      }

      return successResponse(res, 200, 'News fetched successfully', {
        articles: result.rows,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
          total: totalArticles,
          totalPages: Math.ceil(totalArticles / parseInt(limit)),
          hasMore: offset + result.rows.length < totalArticles
        }
      });

    } catch (error) {
      console.error('Get news error:', error);
      return errorResponse(res, 500, 'Failed to fetch news');
    }
  }

  // Get single article
  static async getArticle(req, res) {
    try {
      const { articleId } = req.params;

      const result = await pool.query(
        `SELECT * FROM news_articles 
         WHERE article_id = $1 AND is_active = true`,
        [articleId]
      );

      if (result.rows.length === 0) {
        return errorResponse(res, 404, 'Article not found');
      }

      return successResponse(res, 200, 'Article fetched successfully', result.rows[0]);

    } catch (error) {
      console.error('Get article error:', error);
      return errorResponse(res, 500, 'Failed to fetch article');
    }
  }

  // ✅ Track reading - UNLIMITED (No daily limit)
  static async trackReading(req, res) {
    try {
      const { articleId } = req.params;
      const userId = req.user.userId;
      const { timeSpent } = req.body;

      if (!timeSpent || timeSpent < 0) {
        return errorResponse(res, 400, 'Invalid time spent');
      }

      // Fetch complete article details
      const article = await pool.query(
        `SELECT id, article_id, title, coins_reward, category, 
                description, image_url, source_name, link
         FROM news_articles 
         WHERE article_id = $1 AND is_active = true`,
        [articleId]
      );

      if (article.rows.length === 0) {
        return errorResponse(res, 404, 'Article not found');
      }

      const articleData = article.rows[0];
      const minReadTime = 30;
      const coinsReward = articleData.coins_reward;

      // ✅ Check if already read today - REMOVED DAILY LIMIT CHECK
      const alreadyRead = await pool.query(
        `SELECT id FROM reading_history 
         WHERE user_id = $1 
         AND news_article_id = $2 
         AND reading_date = CURRENT_DATE`,
        [userId, articleData.id]
      );

      if (alreadyRead.rows.length > 0) {
        return errorResponse(res, 400, 'You already read this article today');
      }

      // ✅ REMOVED DAILY LIMIT CHECK - Unlimited reading
      const coinsEarned = timeSpent >= minReadTime ? coinsReward : 0;

      await pool.query('BEGIN');

      // Store complete article data in history
      await pool.query(
        `INSERT INTO reading_history (
          user_id, news_article_id, 
          article_title, article_category, article_image_url,
          article_description, article_link, article_source,
          completed_at, time_spent, coins_earned, is_completed, reading_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, CURRENT_DATE)`,
        [
          userId,
          articleData.id,
          articleData.title,
          articleData.category,
          articleData.image_url || null,
          articleData.description || null,
          articleData.link || null,
          articleData.source_name || null,
          timeSpent,
          coinsEarned,
          timeSpent >= minReadTime
        ]
      );

      // Update article read count
      await pool.query(
        'UPDATE news_articles SET read_count = read_count + 1 WHERE id = $1',
        [articleData.id]
      );

      // Award coins if earned
      if (coinsEarned > 0) {
        await pool.query(
          `INSERT INTO user_wallets (user_id, available_coins, total_earned)
           VALUES ($1, 0, 0)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );

        await pool.query(
          `UPDATE user_wallets 
           SET available_coins = available_coins + $2,
               total_earned = total_earned + $2,
               updated_at = NOW()
           WHERE user_id = $1`,
          [userId, coinsEarned]
        );

        const walletResult = await pool.query(
          'SELECT available_coins FROM user_wallets WHERE user_id = $1',
          [userId]
        );

        const balanceAfter = walletResult.rows[0].available_coins;

        await pool.query(
          `INSERT INTO coin_transactions (
            user_id, transaction_type, amount, balance_after, source, description
          ) VALUES ($1, 'earned', $2, $3, 'article_read', $4)`,
          [userId, coinsEarned, balanceAfter, `Read: ${articleData.title.substring(0, 50)}...`]
        );

        await pool.query(
          `UPDATE user_profiles 
           SET total_articles_read = total_articles_read + 1,
               updated_at = NOW()
           WHERE user_id = $1`,
          [userId]
        );
      }

      // Update daily stats (for streak tracking only)
      await pool.query(
        `INSERT INTO daily_reading_stats (user_id, reading_date, articles_read, coins_earned)
         VALUES ($1, CURRENT_DATE, 1, $2)
         ON CONFLICT (user_id, reading_date) 
         DO UPDATE SET 
           articles_read = daily_reading_stats.articles_read + 1,
           coins_earned = daily_reading_stats.coins_earned + $2`,
        [userId, coinsEarned]
      );

      // Get today's count for response
      const todayCount = await pool.query(
        `SELECT articles_read FROM daily_reading_stats 
         WHERE user_id = $1 AND reading_date = CURRENT_DATE`,
        [userId]
      );

      const articlesReadToday = todayCount.rows[0]?.articles_read || 0;

      // Check streak bonus
      const streakBonus = await NewsController.checkDailyStreak(userId);

      await pool.query('COMMIT');

      return successResponse(res, 200,
        coinsEarned > 0
          ? `🎉 You earned ${coinsEarned} coins!`
          : `⏱️ Read for at least ${minReadTime} seconds to earn coins`,
        {
          coinsEarned,
          timeSpent,
          minTimeRequired: minReadTime,
          articlesReadToday: articlesReadToday,
          isUnlimited: true, // ✅ Flag to show unlimited
          streakBonus: streakBonus || 0
        }
      );

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Track reading error:', error);
      return errorResponse(res, 500, 'Failed to track reading');
    }
  }

  // Check daily streak
  static async checkDailyStreak(userId) {
    try {
      const streakData = await pool.query(
        `SELECT reading_date 
         FROM daily_reading_stats 
         WHERE user_id = $1 
         AND reading_date >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY reading_date DESC`,
        [userId]
      );

      if (streakData.rows.length === 0) return 0;

      let streak = 1;
      const dates = streakData.rows.map(r => new Date(r.reading_date));

      for (let i = 0; i < dates.length - 1; i++) {
        const diff = Math.floor((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24));
        if (diff === 1) {
          streak++;
        } else {
          break;
        }
      }

      await pool.query(
        `UPDATE user_profiles 
         SET current_streak = $2,
             longest_streak = GREATEST(longest_streak, $2),
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, streak]
      );

      let bonusCoins = 0;
      if (streak === 7) {
        bonusCoins = 50;

        await pool.query(
          `UPDATE user_wallets 
           SET available_coins = available_coins + $2,
               total_earned = total_earned + $2,
               updated_at = NOW()
           WHERE user_id = $1`,
          [userId, bonusCoins]
        );

        const walletResult = await pool.query(
          'SELECT available_coins FROM user_wallets WHERE user_id = $1',
          [userId]
        );

        const balanceAfter = walletResult.rows[0].available_coins;

        await pool.query(
          `INSERT INTO coin_transactions (
            user_id, transaction_type, amount, balance_after, source, description
          ) VALUES ($1, 'bonus', $2, $3, 'daily_streak', '7 Day Reading Streak Bonus 🔥')`,
          [userId, bonusCoins, balanceAfter]
        );
      }

      return bonusCoins;

    } catch (error) {
      console.error('Streak check error:', error);
      return 0;
    }
  }

  // Get user stats
  static async getUserStats(req, res) {
    try {
      const userId = req.user.userId;

      const wallet = await pool.query(
        'SELECT * FROM user_wallets WHERE user_id = $1',
        [userId]
      );

      const profile = await pool.query(
        'SELECT total_articles_read, current_streak, longest_streak FROM user_profiles WHERE user_id = $1',
        [userId]
      );

      const todayStats = await pool.query(
        `SELECT * FROM daily_reading_stats 
         WHERE user_id = $1 AND reading_date = CURRENT_DATE`,
        [userId]
      );

      const recentReading = await pool.query(
        `SELECT 
          id,
          time_spent,
          coins_earned,
          reading_date,
          started_at,
          completed_at,
          article_title,
          article_image_url,
          article_category,
          article_description,
          article_link,
          article_source
         FROM reading_history
         WHERE user_id = $1
         ORDER BY started_at DESC
         LIMIT 20`,
        [userId]
      );

      const formattedHistory = recentReading.rows.map(item => ({
        id: item.id,
        title: item.article_title || 'Article Unavailable',
        image_url: item.article_image_url || null,
        category: item.article_category || 'general',
        description: item.article_description || '',
        link: item.article_link || '#',
        source: item.article_source || 'Unknown',
        time_spent: item.time_spent,
        coins_earned: item.coins_earned,
        reading_date: item.reading_date,
        started_at: item.started_at,
        completed_at: item.completed_at
      }));

      return successResponse(res, 200, 'User stats fetched successfully', {
        wallet: wallet.rows[0] || { 
          available_coins: 0, 
          total_earned: 0,
          total_redeemed: 0,
          referral_earnings: 0
        },
        profile: profile.rows[0] || { 
          total_articles_read: 0, 
          current_streak: 0, 
          longest_streak: 0 
        },
        today: todayStats.rows[0] || { 
          articles_read: 0, 
          coins_earned: 0 
        },
        recentReading: formattedHistory
      });

    } catch (error) {
      console.error('Get stats error:', error);
      return errorResponse(res, 500, 'Failed to fetch stats');
    }
  }

  // Force refresh (Admin only)
  static async forceRefresh(req, res) {
    try {
      const { category = 'all' } = req.body;

      console.log(`🔄 Manual refresh triggered for: ${category}`);

      const { articles, batchId } = await NewsService.fetch50Articles(category);
      const saveResult = await NewsService.saveArticles(articles, category);
      await NewsService.cleanOldArticles(category, 100);

      return successResponse(res, 200, 'Refresh completed', {
        category,
        batchId,
        fetched: articles.length,
        saved: saveResult.saved,
        skipped: saveResult.skipped
      });

    } catch (error) {
      console.error('Force refresh error:', error);
      return errorResponse(res, 500, 'Refresh failed');
    }
  }

  // Get fetch stats (Admin only)
  static async getFetchStats(req, res) {
    try {
      const tracking = await pool.query(
        `SELECT * FROM news_fetch_tracking ORDER BY category`
      );

      const recentLogs = await pool.query(
        `SELECT * FROM news_fetch_logs 
         ORDER BY fetched_at DESC 
         LIMIT 50`
      );

      const categoryCounts = await pool.query(
        `SELECT category, COUNT(*) as total, MAX(pub_date) as latest_article
         FROM news_articles 
         WHERE is_active = true
         GROUP BY category
         ORDER BY category`
      );

      return successResponse(res, 200, 'Fetch stats retrieved', {
        tracking: tracking.rows,
        recentLogs: recentLogs.rows,
        categoryCounts: categoryCounts.rows
      });

    } catch (error) {
      console.error('Get stats error:', error);
      return errorResponse(res, 500, 'Failed to fetch stats');
    }
  }

  // ✅ Get news from DB - EXCLUDE already read articles for current user
  static async getNewsFromDB(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        category = 'all',
        page: nextPageToken = null
      } = req.query;

      const pageNum = nextPageToken ?
        parseInt(nextPageToken) || 1 :
        (parseInt(page) || 1);

      const limitNum = parseInt(limit) || 10;
      const offset = (pageNum - 1) * limitNum;

      // ✅ Get userId from request (if authenticated)
      const userId = req.user?.userId || null;

      let whereConditions = ['is_active = true'];
      let values = [];
      let paramCount = 1;

      // ✅ Exclude articles user has already read today
      if (userId) {
        whereConditions.push(`id NOT IN (
          SELECT news_article_id 
          FROM reading_history 
          WHERE user_id = $${paramCount} 
          AND reading_date = CURRENT_DATE
          AND news_article_id IS NOT NULL
        )`);
        values.push(userId);
        paramCount++;
      }

      if (category === 'all' || category === 'All') {
        whereConditions.push(`category IN (
          'sports', 'entertainment', 'politics', 'crime', 'food', 'tourism'
        )`);
      } else {
        whereConditions.push(`category = $${paramCount}`);
        values.push(category.toLowerCase());
        paramCount++;
      }

      const whereClause = whereConditions.join(' AND ');

      const countResult = await pool.query(
        `SELECT COUNT(*) as total 
         FROM news_articles 
         WHERE ${whereClause}`,
        values
      );

      const totalArticles = parseInt(countResult.rows[0].total);

      const result = await pool.query(
        `SELECT 
          article_id, title, description, link, 
          image_url, video_url,
          source_name, source_icon, creator, 
          category, keywords, pub_date,
          view_count, read_count, coins_reward
        FROM news_articles
        WHERE ${whereClause}
        ORDER BY pub_date DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        [...values, limitNum, offset]
      );

      const hasMore = offset + result.rows.length < totalArticles;
      const nextPage = hasMore ? pageNum + 1 : null;

      const formattedArticles = result.rows.map(article => ({
        article_id: article.article_id,
        title: article.title,
        description: article.description,
        link: article.link,
        image_url: article.image_url,
        video_url: article.video_url,
        source_name: article.source_name,
        source_icon: article.source_icon,
        creator: typeof article.creator === 'string' ? JSON.parse(article.creator) : article.creator,
        category: typeof article.category === 'string' ? [article.category] : article.category,
        keywords: typeof article.keywords === 'string' ? JSON.parse(article.keywords) : article.keywords,
        pubDate: article.pub_date,
        content: article.description,
        country: ['in'],
        language: 'english'
      }));

      return successResponse(res, 200, 'News fetched successfully', {
        results: formattedArticles,
        nextPage: nextPage,
        totalResults: totalArticles
      });

    } catch (error) {
      console.error('Get news from DB error:', error);
      return errorResponse(res, 500, 'Failed to fetch news');
    }
  }

  // ✅ NEW: Get latest news from DB (for newsDetails page)
  static async getLatestNews(req, res) {
    try {
      const { limit = 10, excludeId } = req.query;
      const userId = req.user?.userId || null;

      let whereConditions = ['is_active = true'];
      let values = [];
      let paramCount = 1;

      // Exclude current article
      if (excludeId) {
        whereConditions.push(`article_id != $${paramCount}`);
        values.push(excludeId);
        paramCount++;
      }

      // ✅ Exclude articles user has already read today
      if (userId) {
        whereConditions.push(`id NOT IN (
          SELECT news_article_id 
          FROM reading_history 
          WHERE user_id = $${paramCount} 
          AND reading_date = CURRENT_DATE
          AND news_article_id IS NOT NULL
        )`);
        values.push(userId);
        paramCount++;
      }

      const whereClause = whereConditions.join(' AND ');

      const result = await pool.query(
        `SELECT 
          article_id, title, description, link, 
          image_url, source_name, category, pub_date
        FROM news_articles
        WHERE ${whereClause}
        ORDER BY pub_date DESC
        LIMIT $${paramCount}`,
        [...values, parseInt(limit)]
      );

      const formattedArticles = result.rows.map(article => ({
        article_id: article.article_id,
        title: article.title,
        description: article.description,
        link: article.link,
        image_url: article.image_url,
        source_name: article.source_name,
        category: typeof article.category === 'string' ? [article.category] : article.category,
        pubDate: article.pub_date
      }));

      return successResponse(res, 200, 'Latest news fetched', {
        results: formattedArticles
      });

    } catch (error) {
      console.error('Get latest news error:', error);
      return errorResponse(res, 500, 'Failed to fetch latest news');
    }
  }
}

export default NewsController;