const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    // ========== BASIC INFO ==========
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },

    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },

    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false // Don't return password in queries by default
    },

    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number']
    },

    // ========== ADDRESS (Optional - collected during booking) ==========
    address: {
        street: String,
        city: String,
        state: String,
        pincode: String
    },

    // ========== DOCUMENTS (Optional - collected during booking) ==========
    documents: {
        drivingLicense: {
            number: String,
            frontImage: String,  // Cloudinary URL
            backImage: String,   // Cloudinary URL
            expiryDate: Date,
            verified: {
                type: String,
                enum: ['pending', 'verified', 'rejected'],
                default: 'pending'
            },
            rejectionReason: String // Optional: store reason if rejected
        },
        aadhaar: {
            number: String,
            frontImage: String,  // Cloudinary URL - Front side of Aadhaar
            backImage: String,   // Cloudinary URL - Back side of Aadhaar
            verified: {
                type: String,
                enum: ['pending', 'verified', 'rejected'],
                default: 'pending'
            },
            rejectionReason: String
        }
    },

    // ========== EMAIL VERIFICATION WITH OTP ==========
    isEmailVerified: {
        type: Boolean,
        default: false
    },

    emailOTP: {
        code: String,
        expiresAt: Date
    },

    isDocumentVerified: {
        type: Boolean,
        default: false
    },

    // ========== PASSWORD RESET ==========
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // ========== ROLE & STATUS ==========
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },

    isActive: {
        type: Boolean,
        default: true
    },

    // ========== BOOKING STATS ==========
    totalBookings: {
        type: Number,
        default: 0
    },

    totalSpent: {
        type: Number,
        default: 0
    },

    // ========== PROFILE ==========
    profilePicture: String,  // Cloudinary URL
    dateOfBirth: Date,
    gender: {
        type: String,
        enum: ['male', 'female', 'other']
    }

}, {
    timestamps: true  // createdAt, updatedAt
});

// ========== INDEXES ==========

userSchema.index({ phone: 1 });

// ========== PRE-SAVE MIDDLEWARE - Hash Password ==========
userSchema.pre('save', async function () {
    // Only hash password if it's modified
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// ========== METHODS ==========

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};

// Generate password reset token
userSchema.methods.getResetPasswordToken = function () {
    const crypto = require('crypto');

    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash and set to resetPasswordToken field
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set expire time (10 minutes)
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

module.exports = mongoose.model('User', userSchema);
