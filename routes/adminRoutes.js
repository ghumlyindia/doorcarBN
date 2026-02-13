const express = require('express');
const router = express.Router();
const adminController = require('../controller/adminController');
const { protect, authorize } = require('../middleware/auth');

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

router.get('/stats', adminController.getDashboardStats);

module.exports = router;
