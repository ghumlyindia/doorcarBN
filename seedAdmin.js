const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./model/User');

dotenv.config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

const seedAdmin = async () => {
    try {
        await connectDB();

        const adminEmail = 'admin@doorcars.com';
        const adminPassword = 'adminpassword123';

        // Check if admin exists
        let admin = await User.findOne({ email: adminEmail });

        if (admin) {
            console.log('Admin user already exists');
            process.exit();
        }

        // Create Admin
        admin = await User.create({
            name: 'Admin User',
            email: adminEmail,
            password: adminPassword,
            phone: '9876543210',
            role: 'admin',
            isEmailVerified: true,
            isActive: true
        });

        console.log('Admin user created successfully');
        console.log('Email:', adminEmail);
        console.log('Password:', adminPassword);

        process.exit();
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
};

seedAdmin();
