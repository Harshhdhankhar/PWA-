const mongoose = require('mongoose');

const sosAlertSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    address: {
      type: String
    }
  },
  alertType: {
    type: String,
    enum: ['emergency', 'panic', 'medical', 'security'],
    default: 'emergency'
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'false_alarm'],
    default: 'active'
  },
  contactsNotified: [{
    name: String,
    phone: String,
    notificationStatus: {
      type: String,
      enum: ['sent', 'failed', 'pending'],
      default: 'pending'
    },
    sentAt: Date
  }],
  policeNotified: {
    type: Boolean,
    default: false
  },
  policeNotificationStatus: {
    type: String,
    enum: ['sent', 'failed', 'pending'],
    default: 'pending'
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: String
  },
  notes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to sync user and userId fields
sosAlertSchema.pre('save', function(next) {
  if (this.userId && !this.user) {
    this.user = this.userId;
  } else if (this.user && !this.userId) {
    this.userId = this.user;
  }
  next();
});

module.exports = mongoose.model('SOSAlert', sosAlertSchema);
