const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const { protect } = require('../middleware/auth');
const { body } = require('express-validator');

// ========== PUBLIC ROUTES ==========

// Register - with validation
router.post('/register', [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid Indian phone number is required')
], userController.register);

// Verify Email with OTP
router.post('/verify-email', userController.verifyEmail);

// Resend OTP
router.post('/resend-otp', userController.resendOTP);

// Login
router.post('/login', userController.login);

// Forgot Password
router.post('/forgot-password', userController.forgotPassword);

// Reset Password
router.post('/reset-password', userController.resetPassword);

// ========== PROTECTED ROUTES (Require Authentication) ==========

// Get Profile
router.get('/profile', protect, userController.getProfile);

// Update Profile
router.put('/profile', protect, userController.updateProfile);

// Logout
router.post('/logout', protect, userController.logout);

// Upload Documents - Now supports front and back images
const { upload } = require('../config/cloudinary');
router.post('/upload-documents', protect, upload.fields([
    { name: 'aadhaarFront', maxCount: 1 },
    { name: 'aadhaarBack', maxCount: 1 },
    { name: 'drivingLicenseFront', maxCount: 1 },
    { name: 'drivingLicenseBack', maxCount: 1 }
]), userController.uploadDocuments);

// ========== ADMIN ROUTES (Require Authentication & Admin Role) ==========

// Get All Users
router.get('/', protect, userController.getAllUsers);

// Get User by ID
router.get('/:id', protect, userController.getUserById);

// Update User Status
router.put('/:id/status', protect, userController.updateUserStatus);

// Verify User Document
router.put('/:id/verify-document', protect, userController.verifyUserDocument);

module.exports = router;
