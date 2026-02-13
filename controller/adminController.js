const User = require('../model/User');
const Car = require('../model/Car');
const Booking = require('../model/Booking');

// ========== GET DASHBOARD STATS ==========
exports.getDashboardStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Date Range Logic
        let start, end;
        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
            // Adjust end date to include the full day
            end.setHours(23, 59, 59, 999);
        } else {
            // Default: Last 6 Months
            end = new Date();
            start = new Date();
            start.setMonth(start.getMonth() - 6);
            start.setDate(1); // Start from beginning of that month
        }

        const dateFilter = {
            createdAt: { $gte: start, $lte: end }
        };

        // 1. Basic Counts (All Time)
        const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
        const totalCars = await Car.countDocuments();

        // Active Bookings (Current)
        const activeBookings = await Booking.countDocuments({
            status: 'confirmed',
            endDate: { $gt: new Date() }
        });

        // 2. Revenue Calculation (Filtered by Date)
        const revenueResult = await Booking.aggregate([
            {
                $match: {
                    status: { $in: ['confirmed', 'completed'] },
                    ...dateFilter
                }
            },
            { $group: { _id: null, total: { $sum: "$totalPrice" } } }
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

        // 3. Recent Activity (Filtered by Date)
        const recentBookings = await Booking.find(dateFilter)
            .sort({ createdAt: -1 })
            .limit(10) // Increased limit for filtered view
            .populate('user', 'name email avatar')
            .select('user createdAt status totalPrice');

        // 4. Revenue Chart (Dynamic Grouping)
        // Determine grouping: by Day if range <= 31 days, else by Months
        const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
        const groupBy = daysDiff <= 31 ? 'day' : 'month';

        let groupId;
        if (groupBy === 'day') {
            groupId = {
                day: { $dayOfMonth: "$createdAt" },
                month: { $month: "$createdAt" },
                year: { $year: "$createdAt" }
            };
        } else {
            groupId = {
                month: { $month: "$createdAt" },
                year: { $year: "$createdAt" }
            };
        }

        const chartDataRaw = await Booking.aggregate([
            {
                $match: {
                    status: { $in: ['confirmed', 'completed'] },
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: groupId,
                    total: { $sum: "$totalPrice" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
        ]);

        // Format Chart Data
        const chartData = [];
        if (groupBy === 'day') {
            // Fill in missing days
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const day = d.getDate();
                const month = d.getMonth() + 1;
                const year = d.getFullYear();

                const found = chartDataRaw.find(item =>
                    item._id.day === day &&
                    item._id.month === month &&
                    item._id.year === year
                );

                chartData.push({
                    name: `${d.getDate()}/${d.getMonth() + 1}`,
                    date: d.toISOString(),
                    revenue: found ? found.total : 0
                });
            }
        } else {
            // Fill in missing months
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            let current = new Date(start);
            current.setDate(1); // Start from 1st to avoid skipping months with fewer days

            while (current <= end) {
                const month = current.getMonth() + 1;
                const year = current.getFullYear();

                const found = chartDataRaw.find(item =>
                    item._id.month === month &&
                    item._id.year === year
                );

                chartData.push({
                    name: `${monthNames[current.getMonth()]} ${year}`,
                    month: month,
                    year: year,
                    revenue: found ? found.total : 0
                });

                current.setMonth(current.getMonth() + 1);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalCars,
                activeBookings,
                totalRevenue,
                recentActivity: recentBookings,
                revenueChart: chartData,
                dateRange: { start, end, groupBy }
            }
        });

    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard stats',
            error: error.message
        });
    }
};
