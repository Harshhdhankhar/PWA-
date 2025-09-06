const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const User = require('../models/User');
const authenticateToken = require('./auth').authenticateToken;
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only JPEG, JPG, PNG and PDF files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// Upload document
router.post('/upload', authenticateToken, (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error',
        error: 'UPLOAD_ERROR'
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { documentType, documentNumber } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Document file is required'
      });
    }

    if (!documentType || !documentNumber) {
      return res.status(400).json({
        success: false,
        message: 'Document type and number are required'
      });
    }

    // Check if user already has a document of this type
    const existingDoc = await Document.findOne({
      userId: req.user.id,
      documentType: documentType
    });

    if (existingDoc && existingDoc.verificationStatus === 'approved') {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'You already have an approved document of this type'
      });
    }

    // Perform OCR on the uploaded image
    let extractedText = '';
    try {
      console.log('Starting OCR for file:', req.file.path);
      const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng', {
        logger: m => console.log(m)
      });
      extractedText = text;
      console.log('OCR completed successfully');
    } catch (ocrError) {
      console.error('OCR error:', ocrError);
      extractedText = 'OCR processing failed';
    }

    // Create document record
    const document = new Document({
      userId: req.user.id,
      documentType,
      documentNumber,
      fileName: req.file.originalname,
      filePath: req.file.path,
      extractedText
    });

    await document.save();

    res.json({
      success: true,
      message: 'Document uploaded successfully and sent for verification',
      document: {
        id: document._id,
        documentType: document.documentType,
        documentNumber: document.documentNumber,
        fileName: document.fileName,
        verificationStatus: document.verificationStatus,
        extractedText: document.extractedText,
        createdAt: document.createdAt
      }
    });

  } catch (error) {
    console.error('Document upload error:', error);
    
    // Clean up uploaded file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Document upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user's documents
router.get('/my-documents', authenticateToken, async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.user.id })
      .select('-filePath')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      documents
    });

  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents'
    });
  }
});

// Get document image (for viewing)
router.get('/view/:documentId', authenticateToken, async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.documentId,
      userId: req.user.id
    });

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

module.exports = router;
