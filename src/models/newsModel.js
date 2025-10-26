import pool from '../config/database.js';

class NewsModel {
  // Get wallet balance
  static async getArticleById(articleId) {
    const result = await pool.query(
      'SELECT * FROM news_articles WHERE article_id = $1 AND is_active = true',
      [articleId]
    );
    return result.rows[0] || null;
  }

  // Get articles by category
  static async getArticlesByCategory(category, limit = 10, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM news_articles 
       WHERE category = $1 AND is_active = true
       ORDER BY pub_date DESC
       LIMIT $2 OFFSET $3`,
      [category, limit, offset]
    );
    return result.rows;
  }

  // Check if user read article today
  static async hasUserReadToday(userId, articleId) {
    const result = await pool.query(
      `SELECT id FROM reading_history 
       WHERE user_id = $1 
       AND news_article_id = (SELECT id FROM news_articles WHERE article_id = $2)
       AND reading_date = CURRENT_DATE`,
      [userId, articleId]
    );
    return result.rows.length > 0;
  }

  // Get user daily reading count
  static async getUserDailyReadCount(userId) {
    const result = await pool.query(
      `SELECT articles_read FROM daily_reading_stats 
       WHERE user_id = $1 AND reading_date = CURRENT_DATE`,
      [userId]
    );
    return result.rows[0]?.articles_read || 0;
  }
}

export default NewsModel;