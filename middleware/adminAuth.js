// Admin Authentication Middleware for Tourist Safety System

const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Middleware to authenticate admin tokens
const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Handle environment variable authentication (adminId will be 'env-admin')
    if (decoded.adminId === 'env-admin') {
      // For environment variable auth, create a virtual admin object
      req.admin = {
        _id: 'env-admin',
        username: decoded.username,
        role: decoded.role || 'admin'
      };
    } else {
      // Verify admin still exists using adminId from token for database auth
      const admin = await Admin.findById(decoded.adminId);
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. Admin not found.'
        });
      }
      req.admin = admin;
    }

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

module.exports = { adminAuth };
