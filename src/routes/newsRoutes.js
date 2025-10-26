import express from 'express';
import NewsController from '../controllers/newsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/news', NewsController.getNews);
router.get('/news/:articleId', NewsController.getArticle);

// Protected routes (require login)
router.post('/news/:articleId/read', authenticate, NewsController.trackReading);
router.get('/news/user/stats', authenticate, NewsController.getUserStats);

// Admin routes
router.post('/news/admin/refresh', authenticate, authorize('admin'), NewsController.forceRefresh);
router.get('/news/admin/stats', authenticate, authorize('admin'), NewsController.getFetchStats);

router.delete('/news/admin/clean-news', authenticate, authorize('admin'), NewsController.cleanNewsNow);
router.delete('/news/admin/clean-history', authenticate, authorize('admin'), NewsController.cleanHistoryNow);
export default router;