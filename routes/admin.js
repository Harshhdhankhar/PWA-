const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Document = require('../models/Document');
const SOSAlert = require('../models/SOSAlert');
const { adminAuth } = require('../middleware/adminAuth');

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Find admin
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate token
    const token = jwt.sign(
      { adminId: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        role: admin.role
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get dashboard statistics
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [activeSOS, pendingDocs, totalUsers, verifiedUsers] = await Promise.all([
      SOSAlert.countDocuments({ status: 'active' }),
      Document.countDocuments({ verificationStatus: 'pending' }),
      User.countDocuments(),
      User.countDocuments({ documentVerified: true, phoneVerified: true })
    ]);

    res.json({
      success: true,
      activeSOS,
      pendingDocs,
      totalUsers,
      verifiedUsers
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get recent activity
router.get('/recent-activity', adminAuth, async (req, res) => {
  try {
    const activities = [];
    
    // Get recent SOS alerts
    const recentSOS = await SOSAlert.find()
      .populate('user', 'name email')
      .sort({ timestamp: -1 })
      .limit(5);
    
    recentSOS.forEach(alert => {
      activities.push({
        timestamp: alert.timestamp,
        type: 'sos',
        user: alert.user?.name || 'Unknown',
        description: `SOS alert triggered - ${alert.status}`
      });
    });

    // Get recent document uploads
    const recentDocs = await Document.find()
      .populate('user', 'name email')
      .sort({ uploadedAt: -1 })
      .limit(5);
    
    recentDocs.forEach(doc => {
      activities.push({
        filePath: `/uploads/${doc.fileName}`,
        timestamp: doc.uploadedAt,
        type: 'document',
        user: doc.user?.name || 'Unknown',
        description: `Document uploaded - ${doc.documentType} (${doc.verificationStatus})`
      });
    });

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      activities: activities.slice(0, 10)
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all users with filters
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { search, type, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (type) {
      query.userType = type;
    }
    
    const users = await User.find(query, '-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all documents with filters
router.get('/documents', adminAuth, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    if (status) {
      query.verificationStatus = status;
    }
    
    if (type) {
      query.documentType = type;
    }
    
    const documents = await Document.find(query)
      .populate('user', 'name email phone')
      .sort({ uploadedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    // Fix filePath for all documents
    const fixedDocuments = documents.map(doc => {
      const docObject = doc.toObject();
      if (docObject.filePath && docObject.filePath.startsWith('public/')) {
        docObject.filePath = docObject.filePath.replace('public/', '');
      }
      return docObject;
    });
    
    const total = await Document.countDocuments(query);
    
    res.json({
      success: true,
      documents: fixedDocuments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get single document details
router.get('/documents/:id', adminAuth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('user', 'name email phone');
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    // Fix filePath to remove 'public/' prefix for frontend consumption
    const docObject = document.toObject();
    if (docObject.filePath && docObject.filePath.startsWith('public/')) {
      docObject.filePath = docObject.filePath.replace('public/', '');
    }
    
    res.json({
      success: true,
      ...docObject
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Approve document with comprehensive error handling
router.put('/documents/:id/approve', adminAuth, async (req, res) => {
  const documentId = req.params.id;
  
  try {
    // Input validation
    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: 'Document ID is required',
        code: 'MISSING_DOCUMENT_ID'
      });
    }

    // Validate ObjectId format
    if (!documentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format',
        code: 'INVALID_DOCUMENT_ID'
      });
    }

    // Permission check - ensure admin has approval rights
    if (!req.admin || !req.admin.username) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to approve documents',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Find document with error handling
    let document;
    try {
      document = await Document.findById(documentId).populate('user', 'name email');
    } catch (dbError) {
      console.error('Database error finding document:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database error while retrieving document',
        code: 'DATABASE_ERROR'
      });
    }

    // Check if document exists
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or has been deleted',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Check if document is already approved
    if (document.verificationStatus === 'approved') {
      return res.status(409).json({
        success: false,
        message: 'Document is already approved',
        code: 'ALREADY_APPROVED',
        data: {
          verifiedBy: document.verifiedBy,
          verifiedAt: document.verifiedAt
        }
      });
    }

    // Check if document can be approved (not in invalid state)
    if (document.verificationStatus === 'rejected' && document.rejectionReason) {
      // Allow re-approval of rejected documents
      console.log(`Re-approving previously rejected document ${documentId}`);
    }

    // Update document with transaction-like approach
    const updateData = {
      verificationStatus: 'approved',
      verifiedAt: new Date(),
      verifiedBy: req.admin.username,
      rejectionReason: undefined // Clear any previous rejection reason
    };

    let updatedDocument;
    try {
      updatedDocument = await Document.findByIdAndUpdate(
        documentId,
        updateData,
        { 
          new: true, 
          runValidators: true,
          select: 'verificationStatus verifiedAt verifiedBy documentType fileName user'
        }
      );
    } catch (saveError) {
      console.error('Error updating document:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update document status',
        code: 'DOCUMENT_UPDATE_ERROR',
        details: saveError.message
      });
    }

    // Update user's document verification status
    if (document.userId) {
      try {
        await User.findByIdAndUpdate(
          document.userId,
          { 
            documentVerified: true,
            updatedAt: new Date()
          },
          { runValidators: true }
        );
      } catch (userUpdateError) {
        console.error('Error updating user verification status:', userUpdateError);
        // Don't fail the approval if user update fails, but log it
        console.warn(`Document ${documentId} approved but user status update failed`);
      }
    }

    // Log successful approval
    console.log(`Document ${documentId} approved by admin ${req.admin.username}`);

    // Return success response with relevant data
    res.status(200).json({
      success: true,
      message: 'Document approved successfully',
      code: 'APPROVAL_SUCCESS',
      data: {
        documentId: updatedDocument._id,
        documentType: updatedDocument.documentType,
        fileName: updatedDocument.fileName,
        verifiedBy: updatedDocument.verifiedBy,
        verifiedAt: updatedDocument.verifiedAt,
        userName: document.user ? document.user.name : 'Unknown'
      }
    });

  } catch (error) {
    // Comprehensive error logging
    console.error('Unexpected error in document approval:', {
      documentId,
      adminUser: req.admin?.username,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Return generic error to client (don't expose internal details)
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred while approving the document',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// Reject document with comprehensive error handling
router.put('/documents/:id/reject', adminAuth, async (req, res) => {
  const documentId = req.params.id;
  
  try {
    // Input validation
    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: 'Document ID is required',
        code: 'MISSING_DOCUMENT_ID'
      });
    }

    // Validate ObjectId format
    if (!documentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format',
        code: 'INVALID_DOCUMENT_ID'
      });
    }

    // Validate rejection reason
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required and must be a non-empty string',
        code: 'MISSING_REJECTION_REASON'
      });
    }

    if (reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason must be less than 500 characters',
        code: 'REJECTION_REASON_TOO_LONG'
      });
    }

    // Permission check
    if (!req.admin || !req.admin.username) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to reject documents',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Find document with error handling
    let document;
    try {
      document = await Document.findById(documentId).populate('user', 'name email');
    } catch (dbError) {
      console.error('Database error finding document:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database error while retrieving document',
        code: 'DATABASE_ERROR'
      });
    }

    // Check if document exists
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or has been deleted',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Check if document is already rejected
    if (document.verificationStatus === 'rejected') {
      return res.status(409).json({
        success: false,
        message: 'Document is already rejected',
        code: 'ALREADY_REJECTED',
        data: {
          verifiedBy: document.verifiedBy,
          verifiedAt: document.verifiedAt,
          rejectionReason: document.rejectionReason
        }
      });
    }

    // Update document with rejection details
    const updateData = {
      verificationStatus: 'rejected',
      rejectionReason: reason.trim(),
      verifiedAt: new Date(),
      verifiedBy: req.admin.username
    };

    let updatedDocument;
    try {
      updatedDocument = await Document.findByIdAndUpdate(
        documentId,
        updateData,
        { 
          new: true, 
          runValidators: true,
          select: 'verificationStatus verifiedAt verifiedBy documentType fileName rejectionReason user'
        }
      );
    } catch (saveError) {
      console.error('Error updating document:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update document status',
        code: 'DOCUMENT_UPDATE_ERROR',
        details: saveError.message
      });
    }

    // Update user's document verification status to false for rejected documents
    if (document.userId) {
      try {
        await User.findByIdAndUpdate(
          document.userId,
          { 
            documentVerified: false,
            updatedAt: new Date()
          },
          { runValidators: true }
        );
      } catch (userUpdateError) {
        console.error('Error updating user verification status:', userUpdateError);
        // Don't fail the rejection if user update fails, but log it
        console.warn(`Document ${documentId} rejected but user status update failed`);
      }
    }

    // Log successful rejection
    console.log(`Document ${documentId} rejected by admin ${req.admin.username} with reason: ${reason}`);

    // Return success response with relevant data
    res.status(200).json({
      success: true,
      message: 'Document rejected successfully',
      code: 'REJECTION_SUCCESS',
      data: {
        documentId: updatedDocument._id,
        documentType: updatedDocument.documentType,
        fileName: updatedDocument.fileName,
        verifiedBy: updatedDocument.verifiedBy,
        verifiedAt: updatedDocument.verifiedAt,
        rejectionReason: updatedDocument.rejectionReason,
        userName: document.user ? document.user.name : 'Unknown'
      }
    });

  } catch (error) {
    // Comprehensive error logging
    console.error('Unexpected error in document rejection:', {
      documentId,
      adminUser: req.admin?.username,
      rejectionReason: req.body?.reason,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Return generic error to client
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred while rejecting the document',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// Get all SOS alerts with filters
router.get('/sos-alerts', adminAuth, async (req, res) => {
  try {
    const { status, date, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      query.timestamp = {
        $gte: startDate,
        $lt: endDate
      };
    }
    
    const alerts = await SOSAlert.find(query)
      .populate('user', 'name email phone')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await SOSAlert.countDocuments(query);
    
    res.json({
      success: true,
      alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get SOS alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get single SOS alert details
router.get('/sos-alerts/:id', adminAuth, async (req, res) => {
  try {
    const alert = await SOSAlert.findById(req.params.id)
      .populate('user', 'name email phone');
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'SOS alert not found'
      });
    }
    
    res.json({
      success: true,
      ...alert.toObject()
    });
  } catch (error) {
    console.error('Get SOS alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Resolve SOS alert
router.put('/sos-alerts/:id/resolve', adminAuth, async (req, res) => {
  try {
    const alert = await SOSAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'SOS alert not found'
      });
    }
    
    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    alert.resolvedBy = req.admin.username;
    
    await alert.save();
    
    res.json({
      success: true,
      message: 'SOS alert resolved successfully'
    });
  } catch (error) {
    console.error('Resolve SOS alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
