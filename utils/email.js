const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail', // You can use other services
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
};

// Send OTP Email
const sendOTPEmail = async (email, otp, name) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `"Door Cars" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Email Verification - Door Cars',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Welcome to Door Cars! 🚗</h2>
                    <p>Hi ${name},</p>
                    <p>Thank you for registering with Door Cars. Please verify your email address to complete your registration.</p>
                    
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px; color: #6b7280;">Your verification code is:</p>
                        <h1 style="color: #2563eb; font-size: 36px; margin: 10px 0; letter-spacing: 8px;">${otp}</h1>
                        <p style="margin: 0; font-size: 12px; color: #9ca3af;">This code will expire in 10 minutes</p>
                    </div>
                    
                    <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
                    
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                        Door Cars - Self Drive Car Rental<br>
                        <a href="mailto:support@doorcars.com" style="color: #2563eb;">support@doorcars.com</a>
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error) {
        console.error('Email sending error:', error);
        return { success: false, error: error.message };
    }
};

// Send Welcome Email (after verification)
const sendWelcomeEmail = async (email, name) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `"Door Cars" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Welcome to Door Cars! 🎉',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Welcome to Door Cars, ${name}! 🚗</h2>
                    <p>Your email has been verified successfully!</p>
                    <p>You can now start booking your favorite cars for your next adventure.</p>
                    
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
                       style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                        Browse Cars
                    </a>
                    
                    <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                        Need help? Our support team is here for you!<br>
                        Email: <a href="mailto:support@doorcars.com">support@doorcars.com</a>
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error) {
        console.error('Welcome email error:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail,
    sendBookingConfirmationEmail: async (email, bookingDetails) => {
        try {
            const transporter = createTransporter();

            const mailOptions = {
                from: `"Door Cars" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Booking Confirmed! 🚗 - Door Cars',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #2563eb;">Booking Confirmed! 🎉</h2>
                        <p>Hi,</p>
                        <p>Your booking for <strong>${bookingDetails.carName}</strong> has been confirmed.</p>
                        
                        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #1f2937; margin-top: 0;">Booking Details</h3>
                            <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
                            <p><strong>Car:</strong> ${bookingDetails.carName}</p>
                            <p><strong>Start Date:</strong> ${new Date(bookingDetails.startDate).toLocaleString()}</p>
                            <p><strong>End Date:</strong> ${new Date(bookingDetails.endDate).toLocaleString()}</p>
                            <p><strong>Total Price:</strong> ₹${bookingDetails.totalPrice}</p>
                            <p><strong>Location:</strong> ${bookingDetails.city}</p>
                        </div>

                        <p>Thank you for choosing Door Cars! Drive safely.</p>
                        
                        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                            Need help? <a href="mailto:support@doorcars.com">Contact Support</a>
                        </p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Booking email error:', error);
            return { success: false, error: error.message };
        }
    }
};
