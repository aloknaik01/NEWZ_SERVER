
import express from 'express';
import UserController from '../controllers/userController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { updateProfileValidation, validate } from '../middlewares/validations.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(authenticate);

// Get user profile
router.get('/profile', UserController.getProfile);

// Update user profile
router.put('/profile', updateProfileValidation, validate, UserController.updateProfile);

// Get wallet details
router.get('/wallet', UserController.getWallet);

// Get my referrals
router.get('/referrals', UserController.getMyReferrals);

// Get login history
router.get('/login-history', UserController.getLoginHistory);

// Admin only routes
router.get('/admin/dashboard', authorize('admin'), (req, res) => {
  res.json({ message: 'Admin dashboard - Coming soon' });
});

export default router;