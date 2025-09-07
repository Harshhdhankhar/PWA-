const express = require('express');
const twilio = require('twilio');
const User = require('../models/User');
const authenticateToken = require('./auth').authenticateToken;
const router = express.Router();

// Initialize Twilio client for OTP
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID_OTP && process.env.TWILIO_AUTH_TOKEN_OTP && 
      !process.env.TWILIO_ACCOUNT_SID_OTP.startsWith('ACxxxxxxxx')) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID_OTP,
      process.env.TWILIO_AUTH_TOKEN_OTP
    );
  }
} catch (error) {
  console.log('Twilio OTP client not initialized - using demo mode');
}

// Send OTP for phone verification
router.post('/send-otp', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.phoneVerified) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already verified'
      });
    }

    // Format phone number to E.164 format
    let phoneNumber = user.phone;
    
    // Remove all non-digit characters except +
    phoneNumber = phoneNumber.replace(/[^\d+]/g, '');
    
    // Handle different phone number formats
    if (!phoneNumber.startsWith('+')) {
      // If it's a 10-digit Indian number, add +91
      if (phoneNumber.length === 10 && phoneNumber.match(/^[6-9]\d{9}$/)) {
        phoneNumber = '+91' + phoneNumber;
      }
      // If it's 11 digits starting with 91, add +
      else if (phoneNumber.length === 12 && phoneNumber.startsWith('91')) {
        phoneNumber = '+' + phoneNumber;
      }
      // If it's any other format, assume it needs country code
      else if (phoneNumber.length >= 10) {
        // Default to +91 for Indian numbers, but you can modify this logic
        phoneNumber = '+91' + phoneNumber.slice(-10);
      }
      else {
        throw new Error('Invalid phone number format. Please enter a valid phone number.');
      }
    }
    
    // Validate E.164 format (+ followed by 1-15 digits)
    if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
      throw new Error('Invalid phone number format. Please enter a valid international phone number.');
    }

    console.log(`Sending OTP to: ${phoneNumber}`);

    if (!twilioClient) {
      // Demo mode - generate and store OTP without sending SMS
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.tempOTP = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await user.save();

      console.log(`DEMO MODE - OTP for ${phoneNumber}: ${otp}`);
      
      res.json({
        success: true,
        message: 'OTP generated successfully (Demo Mode - Check console for OTP)',
        demoMode: true,
        otp: otp // Only for demo - remove in production
      });
      return;
    }

    try {
      // Use Twilio Verify API
      const verification = await twilioClient.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verifications
        .create({
          to: phoneNumber,
          channel: 'sms'
        });

      console.log('Twilio Verify response:', verification.status);

      res.json({
        success: true,
        message: 'OTP sent successfully',
        status: verification.status
      });

    } catch (twilioError) {
      console.error('Twilio Verify API error:', twilioError);
      
      // Fallback to manual OTP if Twilio Verify fails
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      try {
        await twilioClient.messages.create({
          body: `Your Tourist Safety System verification code is: ${otp}. Valid for 10 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER_OTP,
          to: phoneNumber
        });

        // Store OTP in user document (temporary fallback)
        user.tempOTP = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();

        res.json({
          success: true,
          message: 'OTP sent successfully (fallback)',
          fallback: true
        });

      } catch (fallbackError) {
        console.error('Fallback SMS error:', fallbackError);
        throw fallbackError;
      }
    }

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please check your phone number and try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify OTP
router.post('/verify-otp', authenticateToken, async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'OTP is required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.phoneVerified) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already verified'
      });
    }

    // Format phone number to E.164 format
    let phoneNumber = user.phone;
    
    // Remove all non-digit characters except +
    phoneNumber = phoneNumber.replace(/[^\d+]/g, '');
    
    // Handle different phone number formats
    if (!phoneNumber.startsWith('+')) {
      // If it's a 10-digit Indian number, add +91
      if (phoneNumber.length === 10 && phoneNumber.match(/^[6-9]\d{9}$/)) {
        phoneNumber = '+91' + phoneNumber;
      }
      // If it's 11 digits starting with 91, add +
      else if (phoneNumber.length === 12 && phoneNumber.startsWith('91')) {
        phoneNumber = '+' + phoneNumber;
      }
      // If it's any other format, assume it needs country code
      else if (phoneNumber.length >= 10) {
        // Default to +91 for Indian numbers, but you can modify this logic
        phoneNumber = '+91' + phoneNumber.slice(-10);
      }
      else {
        throw new Error('Invalid phone number format. Please enter a valid phone number.');
      }
    }
    
    // Validate E.164 format (+ followed by 1-15 digits)
    if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
      throw new Error('Invalid phone number format. Please enter a valid international phone number.');
    }

    console.log(`Verifying OTP for: ${phoneNumber}`);

    if (!twilioClient) {
      // Demo mode - verify against stored OTP
      if (user.tempOTP && user.otpExpires) {
        if (new Date() > user.otpExpires) {
          return res.status(400).json({
            success: false,
            message: 'OTP has expired. Please request a new one.'
          });
        }

        if (user.tempOTP === otp) {
          user.phoneVerified = true;
          user.tempOTP = undefined;
          user.otpExpires = undefined;
          await user.save();

          return res.json({
            success: true,
            message: 'Phone number verified successfully (Demo Mode)'
          });
        }
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    try {
      // Try Twilio Verify API first
      const verificationCheck = await twilioClient.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks
        .create({
          to: phoneNumber,
          code: otp
        });

      console.log('Twilio Verify check response:', verificationCheck.status);

      if (verificationCheck.status === 'approved') {
        user.phoneVerified = true;
        user.tempOTP = undefined;
        user.otpExpires = undefined;
        await user.save();

        return res.json({
          success: true,
          message: 'Phone number verified successfully'
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

    } catch (twilioError) {
      console.error('Twilio Verify check error:', twilioError);
      
      // Fallback to manual OTP verification
      if (user.tempOTP && user.otpExpires) {
        if (new Date() > user.otpExpires) {
          return res.status(400).json({
            success: false,
            message: 'OTP has expired. Please request a new one.'
          });
        }

        if (user.tempOTP === otp) {
          user.phoneVerified = true;
          user.tempOTP = undefined;
          user.otpExpires = undefined;
          await user.save();

          return res.json({
            success: true,
            message: 'Phone number verified successfully (fallback)'
          });
        }
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
