// src/routes/newsRoutes.js
import express from 'express';
import NewsController from '../controllers/newsController.js';
import { authenticate, optionalAuth } from '../middlewares/authMiddleware.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();


router.get('/news', NewsController.getNews);
router.get('/news/db', optionalAuth, NewsController.getNewsFromDB);
router.get('/news/:articleId', NewsController.getArticle);


router.get('/news/latest/feed', optionalAuth, NewsController.getLatestNews);


router.post('/news/:articleId/read', authenticate, NewsController.trackReading);
router.get('/news/user/stats', authenticate, NewsController.getUserStats);

// Admin routes
router.post('/news/admin/refresh', authenticate, authorize('admin'), NewsController.forceRefresh);
router.get('/news/admin/stats', authenticate, authorize('admin'), NewsController.getFetchStats);

export default router;