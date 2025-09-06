const express = require('express');
const twilio = require('twilio');
const User = require('../models/User');
const SOSAlert = require('../models/SOSAlert');
const authenticateToken = require('./auth').authenticateToken;
const router = express.Router();

// Initialize Twilio client for SOS alerts (Account 2)
let twilioClientSOS = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID_SOS && process.env.TWILIO_AUTH_TOKEN_SOS && 
      !process.env.TWILIO_ACCOUNT_SID_SOS.startsWith('ACxxxxxxxx')) {
    twilioClientSOS = twilio(
      process.env.TWILIO_ACCOUNT_SID_SOS,
      process.env.TWILIO_AUTH_TOKEN_SOS
    );
  }
} catch (error) {
  console.log('Twilio SOS client not initialized - using demo mode');
}

// Dummy police number for demo
const POLICE_NUMBER = '+91807643514';

// Send SOS Alert
router.post('/sos', authenticateToken, async (req, res) => {
  console.log('=== SOS ALERT ENDPOINT CALLED ===');
  console.log('Request body:', req.body);
  console.log('User ID:', req.user?.id);
  
  try {
    const { latitude, longitude, address, alertType = 'emergency' } = req.body;

    if (!latitude || !longitude) {
      console.log('Missing coordinates - returning 400');
      return res.status(400).json({
        success: false,
        message: 'Location coordinates are required'
      });
    }

    console.log('Finding user by ID:', req.user.id);
    // Get user with emergency contacts
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('User not found - returning 404');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('User found:', user.name, 'Emergency contacts:', user.emergencyContacts?.length || 0);

    // Check if user is fully verified
    if (!user.isFullyVerified()) {
      console.log('User not fully verified - returning 403');
      return res.status(403).json({
        success: false,
        message: 'Only verified users can send SOS alerts'
      });
    }

    // Create Google Maps link
    const mapsLink = `https://maps.google.com/maps?q=${latitude},${longitude}`;
    
    // Create SOS alert record
    const sosAlert = new SOSAlert({
      userId: user._id,
      location: {
        latitude,
        longitude,
        address: address || 'Location not specified'
      },
      alertType
    });

    // Prepare SMS message
    const alertMessage = `SOS! I need help.\nName: ${user.name}\nPhone: ${user.phone}\nLocation: ${mapsLink}`;

    const notifications = [];

    // Send to emergency contacts
    if (user.emergencyContacts && user.emergencyContacts.length > 0) {
      for (const contact of user.emergencyContacts) {
        try {
          if (!twilioClientSOS) {
            // Demo mode - simulate SMS sending
            console.log(`DEMO MODE - Would send SMS to ${contact.name} (${contact.phone}): ${alertMessage}`);
            notifications.push({
              name: contact.name,
              phone: contact.phone,
              notificationStatus: 'sent',
              sentAt: new Date()
            });
          } else {
            // Send 3 SMS messages with 2-second delays for urgency
            for (let i = 1; i <= 3; i++) {
              setTimeout(async () => {
                try {
                  await twilioClientSOS.messages.create({
                    body: `${alertMessage} (Alert ${i}/3)`,
                    from: process.env.TWILIO_PHONE_NUMBER_SOS,
                    to: contact.phone
                  });
                  console.log(`SMS ${i}/3 sent to ${contact.name}: ${contact.phone}`);
                } catch (smsError) {
                  console.error(`Failed to send SMS ${i}/3 to ${contact.name}:`, smsError);
                }
              }, (i - 1) * 2000);
            }

            notifications.push({
              name: contact.name,
              phone: contact.phone,
              notificationStatus: 'sent',
              sentAt: new Date()
            });
          }

        } catch (error) {
          console.error(`Failed to send SMS to ${contact.name}:`, error);
          notifications.push({
            name: contact.name,
            phone: contact.phone,
            notificationStatus: 'failed',
            sentAt: new Date()
          });
        }
      }
    }

    // Send to police (dummy number for demo)
    try {
      const policeMessage = `SOS! I need help.\nName: ${user.name}\nPhone: ${user.phone}\nLocation: ${mapsLink}`;
      
      if (!twilioClientSOS) {
        // Demo mode - simulate police notification
        console.log(`DEMO MODE - Would send police SMS to ${POLICE_NUMBER}: ${policeMessage}`);
        sosAlert.policeNotified = true;
        sosAlert.policeNotificationStatus = 'sent';
      } else {
        await twilioClientSOS.messages.create({
          body: policeMessage,
          from: process.env.TWILIO_PHONE_NUMBER_SOS,
          to: POLICE_NUMBER
        });

        sosAlert.policeNotified = true;
        sosAlert.policeNotificationStatus = 'sent';
        console.log('Police notification sent successfully');
      }

    } catch (policeError) {
      console.error('Failed to send police notification:', policeError);
      sosAlert.policeNotificationStatus = 'failed';
    }

    // Update SOS alert with notification results
    sosAlert.contactsNotified = notifications;
    await sosAlert.save();

    res.json({
      success: true,
      message: 'SOS alert sent successfully',
      alert: {
        id: sosAlert._id,
        alertType: sosAlert.alertType,
        location: sosAlert.location,
        contactsNotified: notifications.length,
        policeNotified: sosAlert.policeNotified,
        createdAt: sosAlert.createdAt
      }
    });

  } catch (error) {
    console.error('=== SOS ALERT ERROR ===', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to send SOS alert',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add emergency contact
router.post('/contacts', authenticateToken, async (req, res) => {
  try {
    const { name, phone, relationship, priority = 1 } = req.body;

    if (!name || !phone || !relationship) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone, and relationship are required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if contact limit reached (max 5 contacts)
    if (user.emergencyContacts.length >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 5 emergency contacts allowed'
      });
    }

    // Format phone number
    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith('+91') && formattedPhone.length === 10) {
      formattedPhone = '+91' + formattedPhone;
    }

    // Add contact
    user.emergencyContacts.push({
      name,
      phone: formattedPhone,
      relationship,
      priority: Math.min(Math.max(priority, 1), 3)
    });

    await user.save();

    res.json({
      success: true,
      message: 'Emergency contact added successfully',
      contact: user.emergencyContacts[user.emergencyContacts.length - 1]
    });

  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add emergency contact'
    });
  }
});

// Get emergency contacts
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('emergencyContacts');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      contacts: user.emergencyContacts
    });

  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch emergency contacts'
    });
  }
});

// Update emergency contact
router.put('/contacts/:contactId', authenticateToken, async (req, res) => {
  try {
    const { name, phone, relationship, priority } = req.body;
    const contactId = req.params.contactId;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const contact = user.emergencyContacts.id(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Update contact fields
    if (name) contact.name = name;
    if (phone) {
      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith('+91') && formattedPhone.length === 10) {
        formattedPhone = '+91' + formattedPhone;
      }
      contact.phone = formattedPhone;
    }
    if (relationship) contact.relationship = relationship;
    if (priority) contact.priority = Math.min(Math.max(priority, 1), 3);

    await user.save();

    res.json({
      success: true,
      message: 'Emergency contact updated successfully',
      contact
    });

  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update emergency contact'
    });
  }
});

// Delete emergency contact
router.delete('/contacts/:contactId', authenticateToken, async (req, res) => {
  try {
    const contactId = req.params.contactId;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const contact = user.emergencyContacts.id(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    contact.remove();
    await user.save();

    res.json({
      success: true,
      message: 'Emergency contact deleted successfully'
    });

  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete emergency contact'
    });
  }
});

// Get user's SOS alerts history
router.get('/sos-history', authenticateToken, async (req, res) => {
  try {
    const alerts = await SOSAlert.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      alerts
    });

  } catch (error) {
    console.error('Get SOS history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SOS history'
    });
  }
});

module.exports = router;
