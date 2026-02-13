const mongoose = require('mongoose');

const carSchema = new mongoose.Schema({

    // ========== BASIC INFO ==========
    brand: {
        type: String,
        required: true,
        trim: true
        // Examples: "Maruti", "Hyundai", "Tata", "Mahindra"
    },

    model: {
        type: String,
        required: true,
        trim: true
        // Examples: "Swift", "i20", "Nexon"
    },

    variant: {
        type: String,
        // Examples: "VXi", "Sportz", "XZ Plus"
    },

    year: {
        type: Number,
        required: true,
        min: 2010,
        max: new Date().getFullYear() + 1
    },

    registrationNumber: {
        type: String,
        unique: true,
        uppercase: true
        // Example: "RJ14AB1234"
    },

    // ========== CATEGORY & TYPE ==========
    category: {
        type: String,
        required: true,
        enum: ['hatchback', 'sedan', 'suv', 'muv', 'luxury', 'electric']
    },

    fuelType: {
        type: String,
        required: true,
        enum: ['petrol', 'diesel', 'cng', 'electric', 'hybrid']
    },

    transmission: {
        type: String,
        required: true,
        enum: ['manual', 'automatic']
    },

    // ========== CAPACITY ==========
    seats: {
        type: Number,
        required: true,
        min: 2,
        max: 10
    },

    bootSpace: {
        type: Number,  // in liters
    },

    // ========== LOCATION (String Approach) ⭐ ==========
    city: {
        type: String,
        required: true,
        trim: true
        // Examples: "Jaipur", "Delhi", "Mumbai"
    },

    area: {
        type: String,
        required: true,
        trim: true
        // Examples: "Vaishali Nagar", "Malviya Nagar", "C-Scheme"
    },

    address: {
        street: String,
        landmark: String,
        pincode: String
    },

    pickupLocations: [{
        name: String,  // "Office", "Airport", "Railway Station"
        address: String,
        coordinates: {
            lat: Number,
            lng: Number
        }
    }],

    // ========== PRICING ==========
    pricing: {
        perHour: {
            type: Number,
            // For hourly rentals (4-6 hours)
        },

        perDay: {
            type: Number,
            required: true,
            // 24 hours
        },

        perWeek: {
            type: Number,
            // 7 days (with discount)
        },

        perMonth: {
            type: Number,
            // 30 days (with discount)
        },

        extraKmCharge: {
            type: Number,
            default: 10
            // Per km after free limit
        },

        freeKmPerDay: {
            type: Number,
            default: 200
            // Free km included per day
        }
    },

    securityDeposit: {
        type: Number,
        required: true,
        default: 1000
    },

    // ========== FEATURES & SPECS ==========
    features: [{
        type: String
        // "AC", "Music System", "GPS", "Sunroof", "Parking Sensors"
    }],

    mileage: {
        type: Number,  // km/l or km/charge
    },

    color: String,

    engineCC: Number,

    // ========== IMAGES ==========
    images: [{
        url: String,  // Cloudinary URL
        public_id: String,  // For deletion
        isPrimary: {
            type: Boolean,
            default: false
        }
    }],

    thumbnail: String,  // Main display image

    // ========== AVAILABILITY ==========
    availability: {
        isAvailable: {
            type: Boolean,
            default: true
        },

        status: {
            type: String,
            enum: ['available', 'booked', 'maintenance', 'inactive'],
            default: 'available'
        },

        bookedDates: [{
            startDate: Date,
            endDate: Date,
            bookingId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Booking'
            }
        }],

        maintenanceSchedule: [{
            startDate: Date,
            endDate: Date,
            reason: String
        }]
    },

    // ========== CONDITION & DOCS ==========
    condition: {
        type: String,
        enum: ['excellent', 'good', 'fair'],
        default: 'good'
    },

    kmDriven: {
        type: Number,
        default: 0
    },

    lastServiceDate: Date,
    nextServiceDue: Date,

    insurance: {
        provider: String,
        policyNumber: String,
        expiryDate: Date,
        document: String  // PDF URL
    },

    puc: {
        certificateNumber: String,
        expiryDate: Date,
        document: String
    },

    // ========== RATING & REVIEWS ==========
    rating: {
        average: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        }
    },

    reviews: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Review'
    }],

    // ========== ADDITIONAL INFO ==========
    description: {
        type: String,
        maxlength: 1000
    },

    rules: [{
        type: String
        // "No smoking", "No pets", "Valid license required"
    }],

    // ========== PICKUP LOCATIONS ==========
    pickupLocations: [{
        name: {
            type: String,
            required: true
            // Example: "Main Hub", "Airport Pickup", "Railway Station"
        },
        address: {
            type: String,
            required: true
            // Full address of the pickup location
        },
        city: String,
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    }],

    // ========== DROP LOCATIONS ==========
    dropLocations: [{
        name: {
            type: String,
            required: true
            // Example: "Main Hub", "Airport Drop", "Railway Station"
        },
        address: {
            type: String,
            required: true
            // Full address of the drop location
        },
        city: String,
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    }],

    minimumRentalHours: {
        type: Number,
        default: 24  // Minimum booking hours
    },

    advanceBookingDays: {
        type: Number,
        default: 1  // How many days in advance can book
    },

    // ========== ADMIN FIELDS ==========
    isActive: {
        type: Boolean,
        default: true
    },

    isFeatured: {
        type: Boolean,
        default: false
    },

    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    totalBookings: {
        type: Number,
        default: 0
    },

    totalRevenue: {
        type: Number,
        default: 0
    }

}, {
    timestamps: true  // createdAt, updatedAt
});

// ========== INDEXES ==========
carSchema.index({ city: 1, category: 1 });
carSchema.index({ 'pricing.perDay': 1 });
carSchema.index({ 'availability.status': 1 });
carSchema.index({ brand: 1, model: 1 });

// ========== VIRTUAL POPULATE ==========
carSchema.virtual('activeBookings', {
    ref: 'Booking',
    localField: '_id',
    foreignField: 'car',
    match: { status: { $in: ['confirmed', 'ongoing'] } }
});

module.exports = mongoose.model('Car', carSchema);