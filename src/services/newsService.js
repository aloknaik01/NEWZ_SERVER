import axios from 'axios';
import pool from '../config/database.js';

const NEWSDATA_API_KEYS = [
    process.env.NEWSDATA_API_KEY_1,
    process.env.NEWSDATA_API_KEY_2,
    process.env.NEWSDATA_API_KEY_3,
    process.env.NEWSDATA_API_KEY_4,
    process.env.NEWSDATA_API_KEY_5,
    process.env.NEWSDATA_API_KEY_6,
    process.env.NEWSDATA_API_KEY_7,
    process.env.NEWSDATA_API_KEY_8,
    process.env.NEWSDATA_API_KEY_9,
    process.env.NEWSDATA_API_KEY_10,
].filter(key => key);

let currentKeyIndex = 0;

const NEWSDATA_BASE_URL = 'https://newsdata.io/api/1/latest';

class NewsService {
    static getNextApiKey() {
        if (NEWSDATA_API_KEYS.length === 0) {
            throw new Error('No NewsData API keys configured');
        }
        const key = NEWSDATA_API_KEYS[currentKeyIndex];
        currentKeyIndex = (currentKeyIndex + 1) % NEWSDATA_API_KEYS.length;
        return key;
    }

    static async fetchPage(category, pageToken = null) {
        try {
            const apiKey = this.getNextApiKey();

            const params = {
                apikey: apiKey,
                country: 'in',
                language: 'en',
                timezone: 'Asia/Kolkata',
                image: 1,
                removeduplicate: 1,
                size: 10
            };

            if (category !== 'all') {
                params.category = category;
            }

            if (pageToken) {
                params.page = pageToken;
            }

            console.log(`📡 Fetching ${category} - Page: ${pageToken || 'first'}`);
            const startTime = Date.now();

            const response = await axios.get(NEWSDATA_BASE_URL, {
                params,
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;

            if (response.data.status === 'success') {
                return {
                    success: true,
                    articles: response.data.results || [],
                    nextPage: response.data.nextPage || null,
                    totalResults: response.data.totalResults || 0,
                    responseTime
                };
            }

            return { success: false, articles: [], nextPage: null };

        } catch (error) {
            console.error('API Error:', error.message);
            return {
                success: false,
                articles: [],
                nextPage: null,
                error: error.message
            };
        }
    }

    static async fetch50Articles(category) {
        console.log(`\nFetching 50 articles for: ${category.toUpperCase()}`);

        const batchId = `${category}_${Date.now()}`;
        const allArticles = [];
        let nextPageToken = null;
        let pageNumber = 1;

        for (let i = 0; i < 5; i++) {
            const result = await this.fetchPage(category, nextPageToken);

            if (result.success && result.articles.length > 0) {
                const articlesWithPage = result.articles.map(article => ({
                    ...article,
                    pageNumber,
                    batchId
                }));

                allArticles.push(...articlesWithPage);
                nextPageToken = result.nextPage;

                await pool.query(
                    `INSERT INTO news_fetch_logs (
            category, request_number, articles_fetched, 
            next_page_token, api_response_time, status
          ) VALUES ($1, $2, $3, $4, $5, 'success')`,
                    [category, i + 1, result.articles.length, nextPageToken, result.responseTime]
                );

                console.log(`Page ${i + 1}: ${result.articles.length} articles (${result.responseTime}ms)`);
                pageNumber++;

                if (i < 4) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } else {
                console.log(`Page ${i + 1}: No articles`);

                await pool.query(
                    `INSERT INTO news_fetch_logs (
            category, request_number, articles_fetched, 
            status, error_message
          ) VALUES ($1, $2, 0, 'failed', $3)`,
                    [category, i + 1, result.error || 'No articles returned']
                );

                break;
            }
        }

        await pool.query(
            `UPDATE news_fetch_tracking 
       SET last_fetch_at = NOW(),
           next_page_token = $2,
           current_batch_id = $3,
           articles_in_current_batch = $4,
           total_articles_fetched = total_articles_fetched + $4,
           updated_at = NOW()
       WHERE category = $1`,
            [category, nextPageToken, batchId, allArticles.length]
        );

        console.log(`Total fetched: ${allArticles.length} articles for ${category}`);
        return { articles: allArticles, batchId };
    }

    static async saveArticles(articles, category) {
        const client = await pool.connect();
        let savedCount = 0;
        let skippedCount = 0;

        try {
            await client.query('BEGIN');

            for (const article of articles) {
                const existing = await client.query(
                    'SELECT id FROM news_articles WHERE article_id = $1',
                    [article.article_id]
                );

                if (existing.rows.length > 0) {
                    skippedCount++;
                    continue;
                }

                let articleCategory = category;
                if (article.category && Array.isArray(article.category) && article.category.length > 0) {
                    articleCategory = article.category[0].toLowerCase();
                }

                await client.query(
                    `INSERT INTO news_articles (
            article_id, title, description, link, content,
            image_url, video_url,
            source_id, source_name, source_url, source_icon,
            creator, keywords, category, language, country,
            pub_date, coins_reward, is_active,
            fetch_batch_id, page_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
                    [
                        article.article_id,
                        article.title || 'Untitled',
                        article.description || '',
                        article.link,
                        article.content || article.description || '',
                        article.image_url || null,
                        article.video_url || null,
                        article.source_id || null,
                        article.source_name || 'Unknown',
                        article.source_url || null,
                        article.source_icon || null,
                        JSON.stringify(article.creator || []),
                        JSON.stringify(article.keywords || []),
                        articleCategory,
                        article.language || 'english',
                        JSON.stringify(article.country || []),
                        article.pubDate || article.pubdate || new Date().toISOString(),
                        10,
                        true,
                        article.batchId,
                        article.pageNumber || 1
                    ]
                );

                savedCount++;
            }

            await client.query('COMMIT');
            console.log(`${category}: Saved ${savedCount}, Skipped ${skippedCount}`);

            return { success: true, saved: savedCount, skipped: skippedCount };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Save error:', error);
            return { success: false, error: error.message };
        } finally {
            client.release();
        }
    }

    static async cleanOldArticles(category, keepCount = 100) {
        try {
            const result = await pool.query(
                `DELETE FROM news_articles 
         WHERE id IN (
           SELECT id FROM news_articles 
           WHERE category = $1 AND is_active = true
           ORDER BY pub_date DESC 
           OFFSET $2
         )`,
                [category, keepCount]
            );

            if (result.rowCount > 0) {
                console.log(`${category}: Cleaned ${result.rowCount} old articles`);
            }

            return result.rowCount;
        } catch (error) {
            console.error('Clean error:', error);
            return 0;
        }
    }

    static async syncAllCategories() {
        console.log('\n ===== SYNCING ALL CATEGORIES =====');
        console.log(`⏰ Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

        const categories = [
            'all',
            'sports',
            'politics',
            'technology',
            'business',
            'entertainment',
            'health',
            'crime'
        ];

        const results = {
            total: 0,
            saved: 0,
            skipped: 0,
            cleaned: 0,
            errors: []
        };

        for (const category of categories) {
            try {
                console.log(`\n--- Processing: ${category.toUpperCase()} ---`);

                const { articles, batchId } = await this.fetch50Articles(category);

                if (articles.length > 0) {
                    const saveResult = await this.saveArticles(articles, category);

                    results.total += articles.length;
                    results.saved += saveResult.saved || 0;
                    results.skipped += saveResult.skipped || 0;

                    const cleaned = await this.cleanOldArticles(category, 100);
                    results.cleaned += cleaned;
                } else {
                    console.log(`No articles fetched for ${category}`);
                }

                await new Promise(resolve => setTimeout(resolve, 3000));

            } catch (error) {
                console.error(`${category} failed:`, error.message);
                results.errors.push({ category, error: error.message });
            }
        }

        console.log('\n ===== SYNC COMPLETED =====');
        console.log(`Total: ${results.total}, Saved: ${results.saved}, Skipped: ${results.skipped}, Cleaned: ${results.cleaned}`);

        return results;
    }
}

export default NewsService;