const express = require('express');
const router = express.Router();
const bookingController = require('../controller/bookingController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

router.post('/create-order', bookingController.createBookingOrder);
router.post('/verify-payment', bookingController.verifyPayment);
router.get('/my-bookings', bookingController.getUserBookings);

// Admin Routes
const { authorize } = require('../middleware/auth');
router.get('/all-bookings', authorize('admin'), bookingController.getAllBookings);
router.get('/:id', authorize('admin'), bookingController.getBookingById);

module.exports = router;
