const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    car: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Car',
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending'
    },
    payment: {
        razorpayOrderId: String,
        razorpayPaymentId: String,
        status: {
            type: String,
            enum: ['pending', 'success', 'failed'],
            default: 'pending'
        }
    },
    address: {
        street: String,
        city: String,
        state: String,
        pincode: String
    },
    pickupLocation: {
        type: String
        // User's selected pickup location name
    },
    dropLocation: {
        type: String
        // User's selected drop location name
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Booking', bookingSchema);
