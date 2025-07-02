const express = require('express');
const User = require('../model/user');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const user = require('../model/user');

const router = express.Router();
const SALT_ROUNDS = 10;

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
  }
});

// Store verification codes temporarily (should use database in production)
const verificationCodes = {};

// Generate verification code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(email, code) {
  const mailOptions = {
    from: 'coppercloud2023@gmail.com',
    to: email,
    subject: 'IoT Control Center - Email Verification',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #3B82F6;">IoT Control Center - Email Verification</h2>
        <p>Thank you for registering with IoT Control Center. To verify your email address, please use the following verification code:</p>
        <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h3 style="font-size: 24px; margin: 0; color: #333;">${code}</h3>
        </div>
        <p>This code will expire in 30 minutes.</p>
        <p>If you did not request this verification, please ignore this email.</p>
        <p>Best regards,<br>IoT Control Center Team</p>
      </div>
    `
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email error:', error);
        reject(error);
      } else {
        console.log('Email sent:', info.response);
        resolve(info);
      }
    });
  });
}

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

router.get('/signin', (req, res) => {
    if (req.session.name) {
        return res.redirect('/home');
    }
    res.render('auth/signin', { errorMsg: null });
});

router.post('/signin', async (req, res) => {
    const { name, password } = req.body;
    try {
        const olduser = await User.findOne({ name });
        if (olduser) {
            return res.render('auth/signin', { errorMsg: 'This email already has an account' });
        }

        // Store the registration details in the session for later use
        req.session.pendingRegistration = {
            email: name,
            password: password
        };

        // Generate and store verification code
        const verificationCode = generateVerificationCode();
        verificationCodes[name] = {
            code: verificationCode,
            expires: Date.now() + 30 * 60 * 1000 // 30 minutes expiration
        };

        // Send verification email
        await sendVerificationEmail(name, verificationCode);

        // Redirect to verification page
        res.redirect('/verify-email');

    } catch (e) {
        console.error('Registration error:', e);
        res.status(500).send('Registration error');
    }
});

// Email verification routes
router.get('/verify-email', (req, res) => {
    if (!req.session.pendingRegistration) {
        return res.redirect('/signin');
    }
    res.render('auth/verify-email', { errorMsg: null, email: req.session.pendingRegistration.email });
});

router.post('/verify-email', async (req, res) => {
    const { verificationCode } = req.body;
    
    if (!req.session.pendingRegistration) {
        return res.redirect('/signin');
    }

    const { email, password } = req.session.pendingRegistration;
    
    // Check if verification code is valid
    if (!verificationCodes[email] || 
        verificationCodes[email].code !== verificationCode ||
        Date.now() > verificationCodes[email].expires) {
        return res.render('auth/verify-email', { 
            errorMsg: 'Invalid or expired verification code', 
            email: email 
        });
    }

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Create new user
        const user = new User({ 
            name: email, 
            password: hashedPassword,
            role: 'user',
            emailVerified: true
        });
        await user.save();

        // Clean up
        delete verificationCodes[email];
        delete req.session.pendingRegistration;

        // Set session
        req.session.userId = user._id;
        req.session.name = user.name;
        req.session.role = user.role;

        // Redirect to home
        res.redirect('/home');
    } catch (e) {
        console.error('Verification error:', e);
        res.status(500).send('Verification error');
    }
});

// Resend verification code
router.post('/resend-verification', async (req, res) => {
    if (!req.session.pendingRegistration) {
        return res.redirect('/signin');
    }

    const email = req.session.pendingRegistration.email;
    
    // Generate new verification code
    const verificationCode = generateVerificationCode();
    verificationCodes[email] = {
        code: verificationCode,
        expires: Date.now() + 30 * 60 * 1000 // 30 minutes expiration
    };

    // Send new verification email
    await sendVerificationEmail(email, verificationCode);

    res.render('auth/verify-email', { 
        errorMsg: null, 
        email: email,
        successMsg: 'Verification code resent!' 
    });
});

router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password', { errorMsg: null, successMsg: null });
});

// Store password reset codes temporarily (should use database in production)
const passwordResetCodes = {};

// Request password reset
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        // Check if user exists
        const user = await User.findOne({ name: email });
        if (!user) {
            return res.render('auth/forgot-password', { 
                errorMsg: 'No account found with this email address', 
                successMsg: null 
            });
        }

        // Generate verification code
        const resetCode = generateVerificationCode();
        
        // Store the reset code with expiration
        passwordResetCodes[email] = {
            code: resetCode,
            expires: Date.now() + 30 * 60 * 1000 // 30 minutes expiration
        };

        // Send reset email
        await sendPasswordResetEmail(email, resetCode);

        // Store email in session for the reset flow
        req.session.passwordReset = {
            email: email,
            step: 'verify-code'
        };

        res.redirect('/verify-reset-code');
    } catch (error) {
        console.error('Password reset error:', error);
        res.render('auth/forgot-password', { 
            errorMsg: 'An error occurred. Please try again later.', 
            successMsg: null 
        });
    }
});

// Verify reset code page
router.get('/verify-reset-code', (req, res) => {
    if (!req.session.passwordReset || req.session.passwordReset.step !== 'verify-code') {
        return res.redirect('/forgot-password');
    }
    
    res.render('auth/verify-reset-code', { 
        errorMsg: null, 
        email: req.session.passwordReset.email 
    });
});

// Verify reset code submission
router.post('/verify-reset-code', async (req, res) => {
    const { resetCode } = req.body;
    
    if (!req.session.passwordReset || req.session.passwordReset.step !== 'verify-code') {
        return res.redirect('/forgot-password');
    }

    const email = req.session.passwordReset.email;
    
    // Check if reset code is valid
    if (!passwordResetCodes[email] || 
        passwordResetCodes[email].code !== resetCode ||
        Date.now() > passwordResetCodes[email].expires) {
        return res.render('auth/verify-reset-code', { 
            errorMsg: 'Invalid or expired reset code', 
            email: email 
        });
    }

    // Update session to move to next step
    req.session.passwordReset.step = 'set-new-password';
    
    res.redirect('/reset-password');
});

// Reset password page (after verification)
router.get('/reset-password', (req, res) => {
    if (!req.session.passwordReset || req.session.passwordReset.step !== 'set-new-password') {
        return res.redirect('/forgot-password');
    }
    
    res.render('auth/reset-password', { 
        errorMsg: null, 
        email: req.session.passwordReset.email 
    });
});

// Process the new password
router.post('/reset-password', async (req, res) => {
    const { password, confirmPassword } = req.body;
    
    if (!req.session.passwordReset || req.session.passwordReset.step !== 'set-new-password') {
        return res.redirect('/forgot-password');
    }

    const email = req.session.passwordReset.email;
    
    // Validate passwords
    if (password !== confirmPassword) {
        return res.render('auth/reset-password', { 
            errorMsg: 'Passwords do not match', 
            email: email 
        });
    }

    try {
        // Get user
        const user = await User.findOne({ name: email });
        if (!user) {
            return res.redirect('/forgot-password');
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Update user password
        user.password = hashedPassword;
        await user.save();

        // Clean up
        delete passwordResetCodes[email];
        delete req.session.passwordReset;

        // Redirect to login with success message
        req.session.passwordResetSuccess = true;
        res.redirect('/login');
    } catch (error) {
        console.error('Password reset error:', error);
        res.render('auth/reset-password', { 
            errorMsg: 'An error occurred. Please try again later.', 
            email: email 
        });
    }
});

// Resend reset code
router.post('/resend-reset-code', async (req, res) => {
    if (!req.session.passwordReset || req.session.passwordReset.step !== 'verify-code') {
        return res.redirect('/forgot-password');
    }

    const email = req.session.passwordReset.email;
    
    // Generate new reset code
    const resetCode = generateVerificationCode();
    passwordResetCodes[email] = {
        code: resetCode,
        expires: Date.now() + 30 * 60 * 1000 // 30 minutes expiration
    };

    // Send new reset email
    await sendPasswordResetEmail(email, resetCode);

    res.render('auth/verify-reset-code', { 
        errorMsg: null, 
        email: email,
        successMsg: 'Reset code resent!' 
    });
});

// Send password reset email function
async function sendPasswordResetEmail(email, code) {
  const mailOptions = {
    from: 'coppercloud2023@gmail.com',
    to: email,
    subject: 'IoT Control Center - Password Reset',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #3B82F6;">IoT Control Center - Password Reset</h2>
        <p>We received a request to reset your password. To continue, please use the following verification code:</p>
        <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h3 style="font-size: 24px; margin: 0; color: #333;">${code}</h3>
        </div>
        <p>This code will expire in 30 minutes.</p>
        <p>If you did not request this password reset, please ignore this email.</p>
        <p>Best regards,<br>IoT Control Center Team</p>
      </div>
    `
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email error:', error);
        reject(error);
      } else {
        console.log('Email sent:', info.response);
        resolve(info);
      }
    });
  });
}

// Modify your login route to show a success message after password reset
router.get('/login', (req, res) => {
    if (req.session.name) {
        return res.redirect('/home');
    }
    
    const successMsg = req.session.passwordResetSuccess ? 
        'Your password has been reset successfully. Please login with your new password.' : null;
    
    // Clear the success flag
    if (req.session.passwordResetSuccess) {
        delete req.session.passwordResetSuccess;
    }
    
    res.render('auth/login', { errorMsg: null, successMsg: successMsg });
});

// router.get('/login', (req, res) => {
//     if (req.session.name) {
//         return res.redirect('/home');
//     }
//     res.render('auth/login', { errorMsg: null });
// });

router.post('/login', async (req, res) => {
    const { name, password } = req.body;
    try {
        const olduser = await User.findOne({ name });
        if (!olduser) {
            console.log('no user found');
            return res.render('auth/login', { errorMsg: 'No user found with this email' });
        }

        // Check if email is verified
        if (!olduser.emailVerified) {
            // Generate new verification code for this user
            const verificationCode = generateVerificationCode();
            verificationCodes[name] = {
                code: verificationCode,
                expires: Date.now() + 30 * 60 * 1000 // 30 minutes expiration
            };

            // Store pending registration data
            req.session.pendingRegistration = {
                email: name,
                password: olduser.password,
                existingUser: true
            };

            // Send verification email
            await sendVerificationEmail(name, verificationCode);

            return res.render('auth/login', { 
                errorMsg: 'Please verify your email before logging in. A new verification code has been sent.' 
            });
        }

        // Compare the provided password with the stored hash
        const passwordMatch = await bcrypt.compare(password, olduser.password);
        
        if (passwordMatch) {
            try {
                req.session.userId = olduser._id;
                req.session.name = olduser.name;
                req.session.role = olduser.role;
                return res.redirect('/home');
            } catch (error) {
                console.error(error);
                return res.status(500).send('Session error');
            }
        }

        return res.render('auth/login', { errorMsg: 'Email or password is incorrect' });

    } catch (e) {
        console.error(e);
        res.status(500).send('login error');
    }
});




// Add a middleware for role-based access control
const requireRole = (role) => {
    return (req, res, next) => {
        if (req.session && req.session.role === role) {
            next();
        } else {
            res.status(403).render('404');
        }
    };
};

// Example of a protected admin route
router.get('/admin-dashboard', requireRole('admin'), async(req, res) => {
    try {
        const users = await User.find();
        res.render('admin/dashboard', { users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Server error');
    }
});

// User profile route
router.get('/admin/user/:id', requireRole('admin'), async(req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send('User not found');
        }
        res.render('admin/user-profile', { user });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;