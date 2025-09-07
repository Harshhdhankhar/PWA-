require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Document = require('../models/Document');
const SOSAlert = require('../models/SOSAlert');

async function resetDatabase() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        console.log('🗑️  Clearing all user data...');
        
        // Clear all collections
        const userCount = await User.countDocuments();
        const documentCount = await Document.countDocuments();
        const sosCount = await SOSAlert.countDocuments();
        
        console.log(`📊 Current data count:`);
        console.log(`   - Users: ${userCount}`);
        console.log(`   - Documents: ${documentCount}`);
        console.log(`   - SOS Alerts: ${sosCount}`);
        
        if (userCount === 0 && documentCount === 0 && sosCount === 0) {
            console.log('✅ Database is already clean!');
            process.exit(0);
        }

        // Delete all data
        await User.deleteMany({});
        await Document.deleteMany({});
        await SOSAlert.deleteMany({});
        
        console.log('✅ All user data has been cleared!');
        console.log('📝 Database is now ready for fresh testing');
        
        // Verify cleanup
        const finalUserCount = await User.countDocuments();
        const finalDocumentCount = await Document.countDocuments();
        const finalSosCount = await SOSAlert.countDocuments();
        
        console.log(`📊 Final data count:`);
        console.log(`   - Users: ${finalUserCount}`);
        console.log(`   - Documents: ${finalDocumentCount}`);
        console.log(`   - SOS Alerts: ${finalSosCount}`);
        
        if (finalUserCount === 0 && finalDocumentCount === 0 && finalSosCount === 0) {
            console.log('🎉 Database reset completed successfully!');
        } else {
            console.log('⚠️  Warning: Some data may not have been cleared');
        }
        
    } catch (error) {
        console.error('❌ Error resetting database:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}

// Run the reset
console.log('🚀 Starting database reset...');
console.log('⚠️  This will delete ALL user data!');
resetDatabase();
