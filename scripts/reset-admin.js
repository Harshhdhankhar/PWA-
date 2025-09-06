// Script to reset admin account
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import Admin model
const Admin = require('../models/Admin');

async function resetAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Delete existing admin
    await Admin.deleteMany({});
    console.log('Deleted existing admin accounts');

    // Create new admin (password will be hashed by pre-save middleware)
    const admin = new Admin({
      username: 'admin',
      password: 'admin123',
      role: 'admin'
    });

    await admin.save();
    console.log('New admin account created successfully!');
    console.log('Username: admin');
    console.log('Password: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error resetting admin:', error);
    process.exit(1);
  }
}

resetAdmin();
