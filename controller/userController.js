const User = require('../model/User');
const { generateToken } = require('../utils/jwt');
const { sendOTPEmail, sendWelcomeEmail } = require('../utils/email');
const { validationResult } = require('express-validator');

// Generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// ========== REGISTER USER ==========
exports.register = async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { name, email, password, phone } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });

        if (user) {
            if (user.isEmailVerified) {
                return res.status(400).json({
                    success: false,
                    message: 'User already exists with this email'
                });
            } else {
                // User exists but not verified - Resend OTP and update details
                const otp = generateOTP();
                const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

                user.name = name;
                user.password = password; // Should be hashed in pre-save hook
                user.phone = phone;
                user.emailOTP = {
                    code: otp,
                    expiresAt: otpExpiry
                };
                await user.save();

                // Send OTP email
                await sendOTPEmail(email, otp, name);

                return res.status(200).json({
                    success: true,
                    message: 'User already registered but not verified. New OTP sent to email.',
                    data: { userId: user._id }
                });
            }
        }

        // Check if phone already exists (only for verified users or new users)
        const existingPhone = await User.findOne({ phone });
        if (existingPhone && existingPhone.email !== email) {
            return res.status(400).json({
                success: false,
                message: 'Phone number already registered'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Create user with OTP
        user = await User.create({
            name,
            email,
            password,
            phone,
            emailOTP: {
                code: otp,
                expiresAt: otpExpiry
            }
        });

        // Send OTP email
        const emailResult = await sendOTPEmail(email, otp, name);

        if (!emailResult.success) {
            console.error('Failed to send OTP email:', emailResult.error);
        }

        res.status(201).json({
            success: true,
            message: 'User registered successfully. Please check your email for OTP verification.',
            data: {
                userId: user._id,
                email: user.email,
                message: 'OTP sent to your email address'
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering user',
            error: error.message
        });
    }
};

// ========== LOGIN USER ==========
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        // Get user with password (select: false by default)
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User with this email does not exist. Please sign up first.'
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Your account has been deactivated'
            });
        }

        // Check if email is verified
        if (!user.isEmailVerified) {
            return res.status(403).json({
                success: false,
                message: 'Please verify your email address to login'
            });
        }

        // Compare password
        const isPasswordMatch = await user.comparePassword(password);

        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate token
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    isEmailVerified: user.isEmailVerified,
                    isDocumentVerified: user.isDocumentVerified
                },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging in',
            error: error.message
        });
    }
};

// ========== GET PROFILE ==========
exports.getProfile = async (req, res) => {
    try {
        // req.user is set by auth middleware
        const user = await User.findById(req.user.id);

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching profile',
            error: error.message
        });
    }
};

// ========== UPDATE PROFILE ==========
exports.updateProfile = async (req, res) => {
    try {
        const allowedUpdates = ['name', 'phone', 'address', 'dateOfBirth', 'gender'];
        const updates = {};

        // Filter allowed updates
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                // Skip empty strings for optional fields that have validation (enum/date)
                if ((key === 'gender' || key === 'dateOfBirth') && !req.body[key]) {
                    return;
                }
                updates[key] = req.body[key];
            }
        });

        const user = await User.findByIdAndUpdate(
            req.user.id,
            updates,
            { returnDocument: 'after', runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
};

// ========== UPLOAD DOCUMENTS ==========
exports.uploadDocuments = async (req, res) => {
    try {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please upload at least one document image'
            });
        }

        const updateQuery = {};
        let documentsUploaded = false;

        // Handle Aadhaar Front Image
        if (req.files.aadhaarFront && req.files.aadhaarFront[0]) {
            updateQuery['documents.aadhaar.frontImage'] = req.files.aadhaarFront[0].path;
            updateQuery['documents.aadhaar.verified'] = 'pending';
            updateQuery['documents.aadhaar.rejectionReason'] = "";
            documentsUploaded = true;
        }

        // Handle Aadhaar Back Image
        if (req.files.aadhaarBack && req.files.aadhaarBack[0]) {
            updateQuery['documents.aadhaar.backImage'] = req.files.aadhaarBack[0].path;
            updateQuery['documents.aadhaar.verified'] = 'pending';
            updateQuery['documents.aadhaar.rejectionReason'] = "";
            documentsUploaded = true;
        }

        // Handle Driving License Front Image
        if (req.files.drivingLicenseFront && req.files.drivingLicenseFront[0]) {
            updateQuery['documents.drivingLicense.frontImage'] = req.files.drivingLicenseFront[0].path;
            updateQuery['documents.drivingLicense.verified'] = 'pending';
            updateQuery['documents.drivingLicense.rejectionReason'] = "";
            documentsUploaded = true;
        }

        // Handle Driving License Back Image
        if (req.files.drivingLicenseBack && req.files.drivingLicenseBack[0]) {
            updateQuery['documents.drivingLicense.backImage'] = req.files.drivingLicenseBack[0].path;
            updateQuery['documents.drivingLicense.verified'] = 'pending';
            updateQuery['documents.drivingLicense.rejectionReason'] = "";
            documentsUploaded = true;
        }

        if (!documentsUploaded) {
            return res.status(400).json({
                success: false,
                message: 'No valid document images uploaded'
            });
        }

        // Reset document verification status when new documents are uploaded
        updateQuery['isDocumentVerified'] = false;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateQuery },
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Documents uploaded successfully',
            data: {
                documents: user.documents,
                isDocumentVerified: user.isDocumentVerified
            }
        });
    } catch (error) {
        console.error('Document upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading documents',
            error: error.message
        });
    }
};

// ========== LOGOUT ==========
exports.logout = async (req, res) => {
    try {
        // For now, just return success
        // In production, you might want to blacklist the token
        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error logging out'
        });
    }
};

// ========== FORGOT PASSWORD ==========
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found with this email'
            });
        }

        // Get reset token
        const resetToken = user.getResetPasswordToken();
        await user.save();

        // In production, send email with reset link
        // For now, just return the token
        res.status(200).json({
            success: true,
            message: 'Password reset token generated',
            resetToken // Remove this in production, send via email
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating reset token',
            error: error.message
        });
    }
};

// ========== RESET PASSWORD ==========
exports.resetPassword = async (req, res) => {
    try {
        const crypto = require('crypto');
        const { resetToken, newPassword } = req.body;

        // Hash token to compare with database
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Set new password
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        // Generate new token
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Password reset successful',
            data: { token }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error resetting password',
            error: error.message
        });
    }
};
// ========== VERIFY EMAIL WITH OTP ==========
exports.verifyEmail = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        // Find user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if already verified
        if (user.isEmailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email already verified'
            });
        }

        // Check OTP
        if (!user.emailOTP || !user.emailOTP.code) {
            return res.status(400).json({
                success: false,
                message: 'No OTP found. Please request a new one.'
            });
        }

        // Check if OTP expired
        if (new Date() > user.emailOTP.expiresAt) {
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        // Verify OTP
        if (user.emailOTP.code !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        // Mark email as verified
        user.isEmailVerified = true;
        user.emailOTP = undefined;
        await user.save();

        // Send welcome email
        await sendWelcomeEmail(email, user.name);

        // Generate token for auto-login
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Email verified successfully!',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    isEmailVerified: true
                },
                token
            }
        });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying email',
            error: error.message
        });
    }
};

// ========== RESEND OTP ==========
exports.resendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email already verified'
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        user.emailOTP = {
            code: otp,
            expiresAt: otpExpiry
        };
        await user.save();

        // Send OTP email
        const emailResult = await sendOTPEmail(email, otp, user.name);

        if (!emailResult.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP email'
            });
        }

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully to your email'
        });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Error resending OTP',
            error: error.message
        });
    }
};

// ========== GET ALL USERS (Admin) ==========
exports.getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search } = req.query;

        let query = { role: { $ne: 'admin' } };
        if (search) {
            query = {
                ...query,
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const users = await User.find(query)
            .select('-password -emailOTP -resetPasswordToken -resetPasswordExpire') // Exclude sensitive fields
            .sort('-createdAt')
            .limit(Number(limit))
            .skip((page - 1) * limit);

        const total = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            count: users.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            data: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
};

// ========== GET USER BY ID (Admin) ==========
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -emailOTP -resetPasswordToken -resetPasswordExpire');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching user details',
            error: error.message
        });
    }
};

// ========== UPDATE USER STATUS (Admin) ==========
exports.updateUserStatus = async (req, res) => {
    try {
        const { isActive } = req.body;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { returnDocument: 'after' }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: `User account ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating user status',
            error: error.message
        });
    }
};

// ========== VERIFY USER DOCUMENT (Admin) ==========
exports.verifyUserDocument = async (req, res) => {
    try {
        const { type, status } = req.body; // status: 'verified', 'rejected', 'pending'
        const { id } = req.params;

        if (!type || !status) {
            return res.status(400).json({
                success: false,
                message: 'Type and status are required'
            });
        }

        const updateQuery = {};

        if (type === 'drivingLicense') {
            updateQuery['documents.drivingLicense.verified'] = status;
            if (status === 'rejected' && req.body.rejectionReason) {
                updateQuery['documents.drivingLicense.rejectionReason'] = req.body.rejectionReason;
            } else if (status === 'verified') {
                updateQuery['documents.drivingLicense.rejectionReason'] = "";
            }
        } else if (type === 'aadhaar') {
            updateQuery['documents.aadhaar.verified'] = status;
            if (status === 'rejected' && req.body.rejectionReason) {
                updateQuery['documents.aadhaar.rejectionReason'] = req.body.rejectionReason;
            } else if (status === 'verified') {
                updateQuery['documents.aadhaar.rejectionReason'] = "";
            }
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid document type. Must be "drivingLicense" or "aadhaar".'
            });
        }


        const user = await User.findByIdAndUpdate(
            id,
            { $set: updateQuery },
            { returnDocument: 'after' }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Auto-update global status logic
        if (type !== 'global') {
            const licenseStatus = user.documents?.drivingLicense?.verified;
            const aadhaarStatus = user.documents?.aadhaar?.verified;

            // If both are verified, mark global as verified
            if (licenseStatus === 'verified' && aadhaarStatus === 'verified') {
                user.isDocumentVerified = true;
                await user.save();
            }
            // If any is rejected, mark global as unverified (false)
            else if (licenseStatus === 'rejected' || aadhaarStatus === 'rejected') {
                user.isDocumentVerified = false;
                await user.save();
            }
        }

        res.status(200).json({
            success: true,
            message: 'Document status updated successfully',
            data: user
        });
    } catch (error) {
        console.error('Verify document error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying document',
            error: error.message
        });
    }
};
