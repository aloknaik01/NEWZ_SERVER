import pool from '../config/database.js';

export async function createNewsArticlesTables() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. News Articles Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS news_articles (
        id SERIAL PRIMARY KEY,
        article_id VARCHAR(100) UNIQUE NOT NULL,
        
        -- Content
        title TEXT NOT NULL,
        description TEXT,
        link TEXT NOT NULL,
        content TEXT,
        
        -- Media
        image_url TEXT,
        video_url TEXT,
        
        -- Source
        source_id VARCHAR(100),
        source_name VARCHAR(200),
        source_url TEXT,
        source_icon TEXT,
        
        -- Metadata
        creator JSONB DEFAULT '[]'::jsonb,
        keywords JSONB DEFAULT '[]'::jsonb,
        category VARCHAR(50) DEFAULT 'other',
        language VARCHAR(20) DEFAULT 'english',
        country JSONB DEFAULT '[]'::jsonb,
        
        -- Dates
        pub_date TIMESTAMP NOT NULL,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Engagement
        view_count INT DEFAULT 0,
        read_count INT DEFAULT 0,
        
        -- Rewards
        coins_reward INT DEFAULT 10,
        
        -- Status
        is_active BOOLEAN DEFAULT true,
        
        -- Tracking
        fetch_batch_id VARCHAR(50),
        page_number INT DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_news_article_id ON news_articles(article_id);
      CREATE INDEX IF NOT EXISTS idx_news_category_date ON news_articles(category, pub_date DESC) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_news_active ON news_articles(is_active, category, pub_date DESC);
    `);

    // 2. News Fetch Tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS news_fetch_tracking (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) UNIQUE NOT NULL,
        last_fetch_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        next_page_token TEXT,
        total_articles_fetched INT DEFAULT 0,
        current_batch_id VARCHAR(50),
        articles_in_current_batch INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO news_fetch_tracking (category) VALUES 
      ('all'), ('sports'), ('politics'), ('technology'), 
      ('business'), ('entertainment'), ('health'), ('crime')
      ON CONFLICT (category) DO NOTHING;
    `);

    // 3. Fetch Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS news_fetch_logs (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50),
        request_number INT,
        articles_fetched INT DEFAULT 0,
        next_page_token TEXT,
        api_response_time INT,
        status VARCHAR(20),
        error_message TEXT,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_logs_category_date ON news_fetch_logs(category, fetched_at DESC);
    `);

    // 4. Reading History (UPDATED - integrates with existing users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS reading_history (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        news_article_id INT REFERENCES news_articles(id) ON DELETE SET NULL,
        article_title TEXT,
        article_category VARCHAR(50),
        article_image_url TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        time_spent INT DEFAULT 0,
        coins_earned INT DEFAULT 0,
        is_completed BOOLEAN DEFAULT false,
        reading_date DATE DEFAULT CURRENT_DATE
      );

      CREATE INDEX IF NOT EXISTS idx_reading_user_date ON reading_history(user_id, reading_date);
      CREATE INDEX IF NOT EXISTS idx_reading_article ON reading_history(news_article_id);
      CREATE INDEX IF NOT EXISTS idx_reading_user_article_date ON reading_history(user_id, news_article_id, reading_date);
    `);

    // 5. Daily Reading Stats
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_reading_stats (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        reading_date DATE DEFAULT CURRENT_DATE,
        articles_read INT DEFAULT 0,
        coins_earned INT DEFAULT 0,
        UNIQUE(user_id, reading_date)
      );

      CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_reading_stats(user_id, reading_date);
    `);

    // 6. Coin Transactions (if not exists)
    await client.query(`
      CREATE TABLE IF NOT EXISTS coin_transactions (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        transaction_type VARCHAR(20) NOT NULL,
        amount BIGINT NOT NULL,
        balance_after BIGINT NOT NULL,
        source VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_user ON coin_transactions(user_id, created_at DESC);
    `);

    // 7. Update user_profiles table (add streak columns if not exist)
    await client.query(`
      ALTER TABLE user_profiles 
      ADD COLUMN IF NOT EXISTS current_streak INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS longest_streak INT DEFAULT 0;
    `);

    await client.query('COMMIT');
    console.log('News tables created successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating news tables:', error);
    throw error;
  } finally {
    client.release();
  }
}