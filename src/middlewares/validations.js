import { body, validationResult } from 'express-validator';
import { errorResponse } from '../utils/responseHandler.js';

// Validation error handler
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return errorResponse(res, 400, 'Validation failed', errors.array());
  }
  
  next();
};

// ✅ UPDATED: Register validation with referral code
export const registerValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long'),
  
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .isLength({ max: 100 }).withMessage('Password too long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase and number'),
  
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters'),
  
  // ✅ NEW: Referral code validation (optional)
  body('referralCode')
    .optional()
    .trim()
    .isLength({ min: 8, max: 8 }).withMessage('Referral code must be 8 characters')
    .isAlphanumeric().withMessage('Referral code must be alphanumeric')
    .toUpperCase() // Auto-convert to uppercase
];

// Login validation
export const loginValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
];

// ✅ NEW: Email + OTP validation
export const verifyOTPValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('otp')
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers')
];

// Email validation (for resend)
export const emailValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail()
];

// Password reset request validation
export const resetRequestValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail()
];

// Password reset validation
export const resetPasswordValidation = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),
  
  body('newPassword')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase and number')
];

// Update profile validation
export const updateProfileValidation = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
  
  body('age')
    .optional()
    .isInt({ min: 13, max: 120 }).withMessage('Age must be between 13-120'),
  
  body('phone')
    .optional()
    .trim()
    .matches(/^[+]?[0-9]{10,15}$/).withMessage('Invalid phone number')
];