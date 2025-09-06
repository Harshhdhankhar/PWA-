const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const User = require('../models/User');
const Document = require('../models/Document');
const SOSAlert = require('../models/SOSAlert');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');

// Remove duplicate authenticateAdmin - using the one from middleware/adminAuth.js

// Get all pending documents for verification
router.get('/documents/pending', authenticateAdmin, async (req, res) => {
  try {
    const documents = await Document.find({ verificationStatus: 'pending' })
      .populate('userId', 'name email phone userType')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      documents
    });

  } catch (error) {
    console.error('Get pending documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending documents'
    });
  }
});

// Get all documents with filters
router.get('/documents', authenticateAdmin, async (req, res) => {
  try {
    const { status, userType, page = 1, limit = 20 } = req.query;
    
    let filter = {};
    if (status) filter.verificationStatus = status;
    
    const documents = await Document.find(filter)
      .populate('userId', 'name email phone userType')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Document.countDocuments(filter);

    // Filter by userType if specified
    let filteredDocs = documents;
    if (userType) {
      filteredDocs = documents.filter(doc => doc.userId && doc.userId.userType === userType);
    }

    res.json({
      success: true,
      documents: filteredDocs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalDocuments: total
      }
    });

  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents'
    });
  }
});

// View document file for admin
router.get('/documents/view/:documentId', authenticateAdmin, async (req, res) => {
  try {
    const document = await Document.findById(req.params.documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Document file not found'
      });
    }

    res.sendFile(path.resolve(document.filePath));

  } catch (error) {
    console.error('View document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to view document'
    });
  }
});

// Approve or reject document
router.post('/documents/:documentId/verify', authenticateAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const documentId = req.params.documentId;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either approved or rejected'
      });
    }

    const document = await Document.findById(documentId).populate('userId');
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update document
    document.verificationStatus = status;
    document.adminNotes = notes || '';
    document.verifiedBy = req.user.id;
    document.verifiedAt = new Date();
    await document.save();

    // Update user's document verification status if approved
    if (status === 'approved') {
      const user = await User.findById(document.userId._id);
      if (user) {
        user.documentVerified = true;
        await user.save();
      }
    }

    res.json({
      success: true,
      message: `Document ${status} successfully`,
      document: {
        id: document._id,
        verificationStatus: document.verificationStatus,
        adminNotes: document.adminNotes,
        verifiedAt: document.verifiedAt
      }
    });

  } catch (error) {
    console.error('Document verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Document verification failed'
    });
  }
});

// Get all users
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, verified, userType } = req.query;
    
    let filter = {};
    if (verified !== undefined) {
      if (verified === 'true') {
        filter.phoneVerified = true;
        filter.documentVerified = true;
      } else if (verified === 'false') {
        filter.$or = [
          { phoneVerified: false },
          { documentVerified: false }
        ];
      }
    }
    if (userType) filter.userType = userType;

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsers: total
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Get SOS alerts
router.get('/sos-alerts', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    let filter = {};
    if (status) filter.status = status;

    const alerts = await SOSAlert.find(filter)
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await SOSAlert.countDocuments(filter);

    res.json({
      success: true,
      alerts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAlerts: total
      }
    });

  } catch (error) {
    console.error('Get SOS alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SOS alerts'
    });
  }
});

// Update SOS alert status
router.post('/sos-alerts/:alertId/update', authenticateAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const alertId = req.params.alertId;

    if (!['active', 'resolved', 'false_alarm'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const alert = await SOSAlert.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'SOS alert not found'
      });
    }

    alert.status = status;
    alert.notes = notes || alert.notes;
    if (status === 'resolved' || status === 'false_alarm') {
      alert.resolvedAt = new Date();
      alert.resolvedBy = 'Admin';
    }
    await alert.save();

    res.json({
      success: true,
      message: 'SOS alert updated successfully',
      alert
    });

  } catch (error) {
    console.error('Update SOS alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SOS alert'
    });
  }
});

// Get admin dashboard stats
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      verifiedUsers,
      pendingDocuments,
      activeSOS,
      totalSOS
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ phoneVerified: true, documentVerified: true }),
      Document.countDocuments({ verificationStatus: 'pending' }),
      SOSAlert.countDocuments({ status: 'active' }),
      SOSAlert.countDocuments()
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        verifiedUsers,
        pendingDocuments,
        activeSOS,
        totalSOS,
        verificationRate: totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : 0
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats'
    });
  }
});

module.exports = router;
