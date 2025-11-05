import express from 'express';
import RedeemController from '../controllers/redeemController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(authenticate);

// ===== USER ENDPOINTS =====

// Get all available gift cards
router.get('/gift-cards', RedeemController.getGiftCards);

// Create redeem request
router.post('/redeem', RedeemController.createRedeemRequest);

// Get user's redeem history
router.get('/redeem/history', RedeemController.getUserRedeemHistory);

// ===== ADMIN ENDPOINTS =====

// Get all redeem requests (Admin only)
router.get('/admin/redeem-requests', 
  authorize('admin'), 
  RedeemController.getAllRedeemRequests
);

// Update redeem request status (Admin only)
router.put('/admin/redeem-requests/:requestId', 
  authorize('admin'), 
  RedeemController.updateRedeemRequest
);

// Get redeem statistics (Admin only)
router.get('/admin/redeem-stats', 
  authorize('admin'), 
  RedeemController.getRedeemStats
);

export default router;