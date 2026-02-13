const Booking = require('../model/Booking');
const Car = require('../model/Car');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { sendBookingConfirmationEmail } = require('../utils/email');

// Lazy initialization of Razorpay to ensure env vars are loaded
const getRazorpayInstance = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error("Razorpay keys are missing in environment variables");
    }
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
};

// ========== CREATE BOOKING ORDER (Init Payment) ==========
exports.createBookingOrder = async (req, res) => {
    try {
        const { carId, startDate, endDate, amount } = req.body;

        if (!carId || !startDate || !endDate || !amount) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // 1. Check Document Verification Requirements
        const user = req.user;
        const docs = user.documents || {};
        const hasUploadedDocs =
            docs.aadhaar?.frontImage && docs.aadhaar?.backImage &&
            docs.drivingLicense?.frontImage && docs.drivingLicense?.backImage;

        // Case 1: First Booking - Must have uploaded documents
        if (user.totalBookings === 0) {
            if (!hasUploadedDocs) {
                return res.status(403).json({
                    success: false,
                    message: 'Please upload your verification documents from your profile before booking your first ride.'
                });
            }
        }

        // Case 2: Subsequent Bookings - Must have verified documents
        if (user.totalBookings > 0 && !user.isDocumentVerified) {
            return res.status(403).json({
                success: false,
                message: 'Your documents must be verified by our team before you can make further bookings.'
            });
        }

        // 2. Double Check Availability
        const car = await Car.findById(carId);
        if (!car) {
            return res.status(404).json({ success: false, message: 'Car not found' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        const isBooked = car.availability.bookedDates.some(booking => {
            const bookingStart = new Date(booking.startDate);
            const bookingEnd = new Date(booking.endDate);
            return (start < bookingEnd && end > bookingStart);
        });

        if (isBooked) {
            return res.status(400).json({
                success: false,
                message: 'Car is already booked for these dates. Please choose different dates.'
            });
        }

        // 2. Create Razorpay Order
        const options = {
            amount: Math.round(amount * 100), // Amount in smallest currency unit (paise)
            currency: "INR",
            receipt: `receipt_order_${Date.now()}`
        };

        const razorpay = getRazorpayInstance();
        const order = await razorpay.orders.create(options);

        if (!order) {
            return res.status(500).json({ success: false, message: 'Some error occured' });
        }

        res.status(200).json({
            success: true,
            data: order,
            keyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Create Order Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating booking order',
            error: error.message
        });
    }
};

// ========== VERIFY PAYMENT & CONFIRM BOOKING ==========
exports.verifyPayment = async (req, res) => {
    try {
        const {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            bookingData
        } = req.body;

        // 1. Verify Signature
        const sign = razorpayOrderId + "|" + razorpayPaymentId;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpaySignature !== expectedSign) {
            return res.status(400).json({ success: false, message: "Invalid signature sent!" });
        }

        // 2. Create Booking in DB
        const { carId, startDate, endDate, totalPrice, address } = bookingData;
        const userId = req.user._id;

        const booking = await Booking.create({
            user: userId,
            car: carId,
            startDate,
            endDate,
            totalPrice,
            status: 'confirmed',
            payment: {
                razorpayOrderId,
                razorpayPaymentId,
                status: 'success'
            },
            address
        });

        // 3. Update Car Availability
        await Car.findByIdAndUpdate(carId, {
            $push: {
                'availability.bookedDates': {
                    startDate,
                    endDate,
                    bookingId: booking._id
                }
            },
            $inc: { totalBookings: 1 }
        });

        // 4. Send Confirmation Email
        // Fetch car details for email
        const car = await Car.findById(carId);

        await sendBookingConfirmationEmail(req.user.email, {
            bookingId: booking._id,
            carName: `${car.brand} ${car.model}`,
            startDate,
            endDate,
            totalPrice,
            city: car.city
        });

        res.status(200).json({
            success: true,
            message: "Payment verified and booking confirmed",
            bookingId: booking._id
        });

    } catch (error) {
        console.error('Verify Payment Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying payment',
            error: error.message
        });
    }
};

// ========== GET USER BOOKINGS ==========
exports.getUserBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({ user: req.user._id })
            .populate('car', 'brand model thumbnail city')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ========== GET ALL BOOKINGS (ADMIN) ==========
exports.getAllBookings = async (req, res) => {
    try {
        const { page = 1, limit = 10, search } = req.query;

        let filter = {};

        if (search) {
            const searchRegex = new RegExp(search, 'i');

            // Find users matching search
            const users = await require('../model/User').find({
                $or: [{ name: searchRegex }, { email: searchRegex }]
            }).select('_id');
            const userIds = users.map(u => u._id);

            // Find cars matching search
            const cars = await require('../model/Car').find({
                $or: [{ brand: searchRegex }, { model: searchRegex }, { registrationNumber: searchRegex }]
            }).select('_id');
            const carIds = cars.map(c => c._id);

            filter.$or = [
                { user: { $in: userIds } },
                { car: { $in: carIds } },
                { status: searchRegex },
                { 'payment.razorpayPaymentId': searchRegex }
            ];

            // Add Booking ID to search if it's a valid ObjectId
            if (search.match(/^[0-9a-fA-F]{24}$/)) {
                filter.$or.push({ _id: search });
            }
        }

        const bookings = await Booking.find(filter)
            .populate('user', 'name email phone')
            .populate('car', 'brand model registrationNumber thumbnail')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Booking.countDocuments(filter);

        res.status(200).json({
            success: true,
            totalPages: Math.ceil(count / limit),
            currentPage: Number(page),
            totalBookings: count,
            data: bookings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching all bookings',
            error: error.message
        });
    }
};

// ========== GET BOOKING BY ID ==========
exports.getBookingById = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('user', 'name email phone avatar')
            .populate('car', 'brand model year registrationNumber thumbnail pricing city address');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching booking details',
            error: error.message
        });
    }
};
