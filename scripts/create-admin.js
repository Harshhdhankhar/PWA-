// Script to create admin account for testing
const mongoose = require('mongoose');
require('dotenv').config();

// Import Admin model
const Admin = require('../models/Admin');

async function createAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tourist-safety');
    console.log('Connected to MongoDB');

    // Delete existing admin if exists
    await Admin.deleteMany({ username: 'admin' });
    console.log('Cleared existing admin accounts');

    // Create admin (password will be hashed by pre-save middleware)
    const admin = new Admin({
      username: 'admin',
      password: 'admin123',
      role: 'admin'  // Use correct enum value
    });

    await admin.save();
    console.log('✅ Admin account created successfully!');
    console.log('Username: admin');
    console.log('Password: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();
