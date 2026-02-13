const Car = require('../model/Car');
const { deleteImage } = require('../config/cloudinary');

// ========== CREATE CAR WITH IMAGES ==========
exports.createCarWithImages = async (req, res) => {
    try {
        // Parse FormData - handle nested objects like pricing.perDay, availability.status
        const carData = {};

        for (const [key, value] of Object.entries(req.body)) {
            // Skip if value is already an object or array
            if (typeof value === 'object' && value !== null) {
                carData[key] = value;
                continue;
            }

            if (key.includes('.')) {
                // Handle nested objects (e.g., "pricing.perDay" -> pricing: { perDay: value })
                const [parent, child] = key.split('.');
                if (!carData[parent]) carData[parent] = {};

                // Convert numbers (only for string values)
                const numValue = Number(value);
                carData[parent][child] = isNaN(numValue) ? value : numValue;
            } else if (key.startsWith('rating[')) {
                // Handle rating[average], rating[count]
                if (!carData.rating) carData.rating = {};
                const field = key.match(/rating\[(\w+)\]/)[1];
                const numValue = Number(value);
                carData.rating[field] = isNaN(numValue) ? value : numValue;
            } else {
                // Check if value is a JSON string (for arrays/objects like pickupLocations)
                try {
                    const parsed = JSON.parse(value);
                    if (typeof parsed === 'object' && parsed !== null) {
                        carData[key] = parsed;
                        continue;
                    }
                } catch (e) {
                    // Not a JSON string, continue
                }

                // Regular fields - convert numbers (only for string values)
                const numValue = Number(value);
                carData[key] = isNaN(numValue) ? value : numValue;
            }
        }

        // Handle thumbnail image
        if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
            carData.thumbnail = req.files.thumbnail[0].path;
        }

        // Handle multiple car images
        if (req.files && req.files.images) {
            carData.images = req.files.images.map(file => ({
                url: file.path,
                public_id: file.filename,
                isPrimary: false
            }));

            // Set first image as primary if exists
            if (carData.images.length > 0) {
                carData.images[0].isPrimary = true;
            }
        }

        const car = new Car(carData);
        await car.save();

        res.status(201).json({
            success: true,
            message: 'Car added successfully with images',
            data: car
        });
    } catch (error) {
        console.error('Error creating car:', error);

        // Delete uploaded images if car creation fails
        if (req.files) {
            if (req.files.thumbnail) {
                for (const file of req.files.thumbnail) {
                    await deleteImage(file.filename).catch(err => console.error(err));
                }
            }
            if (req.files.images) {
                for (const file of req.files.images) {
                    await deleteImage(file.filename).catch(err => console.error(err));
                }
            }
        }

        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// ========== CREATE CAR (Without Images - Legacy) ==========
exports.createCar = async (req, res) => {
    try {
        const car = new Car(req.body);
        await car.save();
        res.status(201).json({
            success: true,
            message: 'Car added successfully',
            data: car
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// ========== GET ALL CARS ==========
exports.getAllCars = async (req, res) => {
    try {
        const {
            city,
            category,
            transmission,
            fuelType,
            minPrice,
            maxPrice,
            seats,
            availability,
            page = 1,
            limit = 10,
            sort = '-createdAt'
        } = req.query;

        let filter = { isActive: true };

        if (city) filter.city = { $regex: city, $options: 'i' };
        if (category) filter.category = category;
        if (transmission) filter.transmission = transmission;
        if (fuelType) filter.fuelType = fuelType;

        // General Search Filter (Brand, Model, Category)
        if (req.query.search) {
            const searchRegex = { $regex: req.query.search, $options: 'i' };
            filter.$or = [
                { brand: searchRegex },
                { model: searchRegex },
                { category: searchRegex },
                { city: searchRegex }
            ];
        }

        if (minPrice || maxPrice) {
            filter['pricing.perDay'] = {};
            if (minPrice) filter['pricing.perDay'].$gte = Number(minPrice);
            if (maxPrice) filter['pricing.perDay'].$lte = Number(maxPrice);
        }

        if (seats) filter.seats = { $gte: Number(seats) };
        if (availability) filter['availability.status'] = availability;

        // Date Range Filtering
        if (req.query.startDate && req.query.endDate) {
            const start = new Date(req.query.startDate);
            const end = new Date(req.query.endDate);

            // Filter out cars that are booked or in maintenance during the requested period
            // Overlap logic: (StartA < EndB) && (EndA > StartB)
            filter.$and = [
                {
                    'availability.bookedDates': {
                        $not: {
                            $elemMatch: {
                                startDate: { $lt: end },
                                endDate: { $gt: start }
                            }
                        }
                    }
                },
                {
                    'availability.maintenanceSchedule': {
                        $not: {
                            $elemMatch: {
                                startDate: { $lt: end },
                                endDate: { $gt: start }
                            }
                        }
                    }
                }
            ];
        }

        const skip = (page - 1) * limit;
        const cars = await Car.find(filter)
            .sort(sort)
            .limit(Number(limit))
            .skip(skip)
            .lean();

        const totalCars = await Car.countDocuments(filter);

        // Inject Pricing Tiers if Dates are Provided
        if (req.query.startDate && req.query.endDate) {
            const start = new Date(req.query.startDate);
            const end = new Date(req.query.endDate);
            const durationMs = end - start;
            const durationHours = durationMs / (1000 * 60 * 60);

            const durationDaysOnly = Math.floor(durationHours / 24);
            const remainingHours = durationHours % 24;
            // Use exact fractional days for billing
            const billingDays = durationHours / 24;
            // For KM calculation, use minimum 1 day
            const kmCalculationDays = Math.max(1, billingDays);

            cars.forEach(car => {
                const baseRate = car.pricing.perDay;
                const extraKmCharge = car.pricing.extraKmCharge || 10;

                const price200 = Math.round(baseRate * billingDays);
                const price400 = Math.round(baseRate * 1.5 * billingDays);
                const price1000 = Math.round(baseRate * 2.25 * billingDays);

                car.calculatedPricing = {
                    duration: {
                        days: durationDaysOnly,
                        hours: remainingHours.toFixed(1),
                        totalHours: durationHours.toFixed(1)
                    },
                    tiers: {
                        limit200: {
                            price: price200,
                            includedKm: Math.round(200 * kmCalculationDays), // Minimum 200km
                            label: '200 Kms/Day',
                            extraKmCharge
                        },
                        limit400: {
                            price: price400,
                            includedKm: Math.round(400 * kmCalculationDays), // Minimum 400km
                            label: '400 Kms/Day',
                            extraKmCharge
                        },
                        limit1000: {
                            price: price1000,
                            includedKm: Math.round(1000 * kmCalculationDays), // Minimum 1000km
                            label: '1000 Kms/Day',
                            extraKmCharge
                        }
                    }
                };
            });
        }

        res.status(200).json({
            success: true,
            count: cars.length,
            total: totalCars,
            totalPages: Math.ceil(totalCars / limit),
            currentPage: Number(page),
            data: cars
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ========== GET CAR BY ID ==========
exports.getCarById = async (req, res) => {
    try {
        const car = await Car.findById(req.params.id);

        if (!car) {
            return res.status(404).json({
                success: false,
                message: 'Car not found'
            });
        }

        res.status(200).json({
            success: true,
            data: car
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ========== GET CITIES ==========
exports.getAvailableCities = async (req, res) => {
    try {
        const cities = await Car.distinct('city', {
            isActive: true,
            'availability.status': 'available'
        });

        res.status(200).json({
            success: true,
            count: cities.length,
            data: cities.sort()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ========== GET FEATURED CARS ==========
exports.getFeaturedCars = async (req, res) => {
    try {
        const cars = await Car.find({
            isFeatured: true,
            isActive: true,
            'availability.status': 'available'
        })
            .sort({ 'rating.average': -1 })
            .limit(6);

        res.status(200).json({
            success: true,
            count: cars.length,
            data: cars
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ========== CHECK AVAILABILITY ==========
exports.checkAvailability = async (req, res) => {
    try {
        const { carId, startDate, endDate } = req.query;

        if (!carId || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'carId, startDate, and endDate are required'
            });
        }

        const car = await Car.findById(carId);

        if (!car) {
            return res.status(404).json({
                success: false,
                message: 'Car not found'
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        const isBooked = car.availability.bookedDates.some(booking => {
            const bookingStart = new Date(booking.startDate);
            const bookingEnd = new Date(booking.endDate);
            return (start <= bookingEnd && end >= bookingStart);
        });

        const inMaintenance = car.availability.maintenanceSchedule.some(maintenance => {
            const maintenanceStart = new Date(maintenance.startDate);
            const maintenanceEnd = new Date(maintenance.endDate);
            return (start <= maintenanceEnd && end >= maintenanceStart);
        });

        const isAvailable = !isBooked && !inMaintenance && car.availability.isAvailable;

        res.status(200).json({
            success: true,
            data: {
                carId: car._id,
                isAvailable,
                reason: isBooked ? 'Already booked' : inMaintenance ? 'Under maintenance' : null
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ========== UPDATE CAR ==========
exports.updateCar = async (req, res) => {
    try {
        let car = await Car.findById(req.params.id);

        if (!car) {
            return res.status(404).json({
                success: false,
                message: 'Car not found'
            });
        }

        // Parse FormData updates
        const updates = {};
        for (const [key, value] of Object.entries(req.body)) {
            if (typeof value === 'object' && value !== null) {
                updates[key] = value;
                continue;
            }

            if (key.includes('.')) {
                const [parent, child] = key.split('.');
                if (!updates[parent]) updates[parent] = car[parent] ? car[parent].toObject() : {};

                const numValue = Number(value);
                updates[parent][child] = isNaN(numValue) ? value : numValue;
            } else if (key.startsWith('rating[')) {
                if (!updates.rating) updates.rating = car.rating ? car.rating.toObject() : {};
                const field = key.match(/rating\[(\w+)\]/)[1];
                const numValue = Number(value);
                updates.rating[field] = isNaN(numValue) ? value : numValue;
            } else {
                // Check if value is a JSON string (for arrays/objects like pickupLocations)
                try {
                    const parsed = JSON.parse(value);
                    if (typeof parsed === 'object' && parsed !== null) {
                        updates[key] = parsed;
                        continue;
                    }
                } catch (e) {
                    // Not a JSON string, continue
                }

                const numValue = Number(value);
                updates[key] = isNaN(numValue) ? value : numValue;
            }
        }

        // Handle Thumbnail Update
        if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
            // Optional: Delete old thumbnail from Cloudinary here
            updates.thumbnail = req.files.thumbnail[0].path;
        }

        // Handle New Images (Append)
        if (req.files && req.files.images) {
            const newImages = req.files.images.map(file => ({
                url: file.path,
                public_id: file.filename,
                isPrimary: false
            }));

            updates.images = [...car.images, ...newImages];
        }

        // Handle Image Deletion (if requested via body.imagesToDelete)
        // Expecting imagesToDelete as array of _id strings
        if (req.body.imagesToDelete) {
            const idsToDelete = Array.isArray(req.body.imagesToDelete)
                ? req.body.imagesToDelete
                : [req.body.imagesToDelete];

            const currentImages = updates.images || car.images;
            updates.images = currentImages.filter(img => !idsToDelete.includes(img._id.toString()));
        }

        car = await Car.findByIdAndUpdate(req.params.id, updates, {
            returnDocument: 'after',
            runValidators: true
        });

        res.status(200).json({
            success: true,
            message: 'Car updated successfully',
            data: car
        });
    } catch (error) {
        console.error('Update car error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// ========== DELETE CAR ==========
exports.deleteCar = async (req, res) => {
    try {
        const car = await Car.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { returnDocument: 'after' }
        );

        if (!car) {
            return res.status(404).json({
                success: false,
                message: 'Car not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Car deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// ========== CALCULATE PRICE ==========
exports.calculatePrice = async (req, res) => {
    try {
        const { carId, startDate, endDate } = req.body;

        if (!carId || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Please provide carId, startDate, and endDate'
            });
        }

        const car = await Car.findById(carId);
        if (!car) {
            return res.status(404).json({
                success: false,
                message: 'Car not found'
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const durationMs = end - start;
        const durationHours = durationMs / (1000 * 60 * 60);

        if (durationHours <= 0) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Exact Breakup
        const durationDaysOnly = Math.floor(durationHours / 24);
        const remainingHours = durationHours % 24;

        // Billing Logic for Calculation:
        const billingDays = durationHours / 24;

        // For KM calculation, use minimum 1 day to ensure users get full daily allowance
        // even for 8-9 hour bookings
        const kmCalculationDays = Math.max(1, billingDays);

        const baseRate = car.pricing.perDay;
        const extraKmCharge = car.pricing.extraKmCharge || 10;
        const securityDeposit = car.securityDeposit || 0;

        // Calculate 3 Tiers
        // Price is based on actual billing days, but KM is minimum 1 day
        const tiers = [
            {
                id: 'tier_200',
                name: '200 Kms/Day',
                includedKm: Math.round(200 * kmCalculationDays), // Minimum 200km even for 8hrs
                price: Math.round(baseRate * billingDays), // Price based on actual hours
                extraKmCharge,
                securityDeposit,
                finalPrice: Math.round(baseRate * billingDays) + Math.round((baseRate * billingDays) * 0.05), // Including 5% Tax
                recommended: false
            },
            {
                id: 'tier_400',
                name: '400 Kms/Day',
                includedKm: Math.round(400 * kmCalculationDays), // Minimum 400km even for 8hrs
                price: Math.round(baseRate * 1.5 * billingDays), // Price based on actual hours
                extraKmCharge,
                securityDeposit,
                finalPrice: Math.round(baseRate * 1.5 * billingDays) + Math.round((baseRate * 1.5 * billingDays) * 0.05),
                recommended: true
            },
            {
                id: 'tier_1000',
                name: '1000 Kms/Day',
                includedKm: Math.round(1000 * kmCalculationDays), // Minimum 1000km even for 8hrs
                price: Math.round(baseRate * 2.25 * billingDays), // Price based on actual hours
                extraKmCharge,
                securityDeposit,
                finalPrice: Math.round(baseRate * 2.25 * billingDays) + Math.round((baseRate * 2.25 * billingDays) * 0.05),
                recommended: false
            }
        ];

        // Format Duration String
        let durationString = `${durationDaysOnly} Days`;
        if (remainingHours > 0) {
            durationString += ` ${Math.round(remainingHours)} Hours`;
        }

        res.status(200).json({
            success: true,
            data: {
                carId: car._id,
                carName: `${car.brand} ${car.model}`,
                startDate,
                endDate,
                duration: {
                    days: durationDaysOnly,
                    hours: remainingHours.toFixed(1),
                    totalHours: durationHours.toFixed(1),
                    text: durationString
                },
                pricingTiers: tiers
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error calculating price',
            error: error.message
        });
    }
};