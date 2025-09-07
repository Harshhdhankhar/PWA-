// Dashboard JavaScript for Tourist Safety System

let map;
let userMarker;
let sosTimeout;
let currentUser = null;

// Utility functions
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) return;

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `
        <span>${message}</span>
        <button class="close-btn" data-dismiss="alert">&times;</button>
    `;
    
    // Add event listener for close button
    const closeBtn = alertDiv.querySelector('[data-dismiss="alert"]');
    closeBtn.addEventListener('click', function() {
        this.parentElement.remove();
    });
    
    alertContainer.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentElement) {
            alertDiv.remove();
        }
    }, 5000);
}

// API helper function with rate limit handling
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    
    // Handle FormData differently - don't set Content-Type for multipart uploads
    const isFormData = options.body instanceof FormData;
    
    const defaultOptions = {
        headers: {
            ...(token && { 'Authorization': `Bearer ${token}` }),
            // Only set Content-Type for non-FormData requests
            ...(!isFormData && { 'Content-Type': 'application/json' })
        }
    };

    const config = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(endpoint, config);
        
        // Handle 429 rate limit responses
        if (response.status === 429) {
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                // Fallback if response isn't JSON
                data = {
                    success: false,
                    message: 'Too many requests. Please try again later.',
                    error: 'RATE_LIMIT_EXCEEDED'
                };
            }
            
            const error = new Error(data.message || 'Rate limit exceeded');
            error.status = 429;
            error.response = data;
            error.retryAfter = data.retryAfter || 60;
            throw error;
        }
        
        // Always try to parse as JSON, but handle non-JSON responses gracefully
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            // If response isn't JSON, create a fallback error object
            const text = await response.text();
            console.error('Non-JSON response:', text);
            data = {
                success: false,
                message: `Server returned non-JSON response: ${response.status} ${response.statusText}`,
                error: 'INVALID_JSON_RESPONSE',
                rawResponse: text.substring(0, 200) // First 200 chars for debugging
            };
        }
        
        if (!response.ok) {
            const error = new Error(data.message || 'Request failed');
            error.status = response.status;
            error.response = data;
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('API call error:', error);
        
        // Handle network errors
        if (!error.status && error.name === 'TypeError') {
            error.message = 'Network error. Please check your connection.';
            error.status = 0;
        }
        
        // Re-throw with enhanced error information
        if (error.response) {
            error.message = error.response.message || error.message;
        }
        throw error;
    }
}

// Authentication helpers
function isAuthenticated() {
    return !!localStorage.getItem('token');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('admin');
    localStorage.removeItem('isAdmin');
    window.location.href = '/login';
}

// Initialize dashboard
function initializeDashboard() {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        logout();
        return;
    }
    
    // Add delay between API calls to prevent rate limiting
    loadUserProfile();
    
    // Add event listeners for buttons
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('send-otp-btn')?.addEventListener('click', sendOTP);
    document.getElementById('verify-otp-btn')?.addEventListener('click', verifyOTP);
    document.getElementById('add-contact-btn')?.addEventListener('click', showContactModal);
    document.getElementById('close-contact-modal')?.addEventListener('click', closeContactModal);
    
    // Contact form submission
    document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contactData = {
            name: document.getElementById('contactName').value,
            phone: document.getElementById('contactPhone').value,
            relationship: document.getElementById('contactRelationship').value,
            priority: parseInt(document.getElementById('contactPriority').value)
        };
        await addContact(contactData);
    });

    // Emergency numbers click to call
    document.querySelectorAll('.feature-card[data-number]').forEach(card => {
        card.addEventListener('click', () => {
            const number = card.getAttribute('data-number');
            if (confirm(`Call ${number}?`)) {
                window.location.href = `tel:${number}`;
            }
        });
    });

    // SOS button event listeners
    const sosButton = document.getElementById('sosButton');
    if (sosButton) {
        // Mouse events
        sosButton.addEventListener('mousedown', startSOS);
        sosButton.addEventListener('mouseup', cancelSOS);
        sosButton.addEventListener('mouseleave', cancelSOS);
        
        // Touch events for mobile
        sosButton.addEventListener('touchstart', startSOS);
        sosButton.addEventListener('touchend', cancelSOS);
        sosButton.addEventListener('touchcancel', cancelSOS);
    }

    console.log('Dashboard initialized successfully');
}

// Load user profile and check verification status
async function loadUserProfile(forceRefresh = false) {
    // Skip cooldown if force refresh is requested
    if (!forceRefresh) {
        // Prevent repeated calls within cooldown period
        const now = Date.now();
        if (profileLoadInProgress || (now - lastProfileLoadTime < PROFILE_LOAD_COOLDOWN)) {
            console.log('Profile load skipped - cooldown active or already in progress');
            return;
        }
    }
    
    profileLoadInProgress = true;
    const now = Date.now();
    lastProfileLoadTime = now;
    localStorage.setItem('lastProfileLoad', now.toString());
    
    try {
        const response = await apiCall('/api/auth/profile');
        if (response.success) {
            currentUser = response.user;
            displayUserInfo(currentUser);
            checkVerificationStatus(currentUser);
        } else {
            throw new Error(response.message || 'Failed to load profile');
        }
    } catch (error) {
        console.error('Failed to load user profile:', error);
        
        // Handle rate limiting specifically
        if (error.status === 429) {
            const retryAfter = error.retryAfter || 60;
            showAlert(`Too many requests. Please wait ${retryAfter} seconds before trying again.`, 'warning');
            
            // Show rate limit UI
            const userDetails = document.getElementById('user-details');
            if (userDetails) {
                userDetails.innerHTML = `
                    <div style="color: #f39c12;">
                        <i class="fas fa-clock"></i> Rate limited - please wait ${retryAfter}s
                        <button class="btn btn-sm btn-secondary ml-2" id="retry-user-profile" style="margin-left: 10px;">
                            <i class="fas fa-refresh"></i> Retry
                        </button>
                    </div>
                `;
                
                // Add event listener for retry button
                document.getElementById('retry-user-profile')?.addEventListener('click', () => {
                    loadUserProfile(true); // Force refresh on retry
                });
            }
        } else {
            showAlert('Failed to load user profile. Please refresh the page.', 'error');
        }
    } finally {
        profileLoadInProgress = false;
    }
}

function displayUserInfo(user) {
    const userDetails = document.getElementById('user-details');
    userDetails.innerHTML = `
        <div>
            <strong>${user.name}</strong>
            <div style="font-size: 0.9rem; color: #666;">
                ${user.email} | ${user.phone}
            </div>
        </div>
    `;

    const verificationStatus = document.getElementById('verification-status');
    verificationStatus.innerHTML = `
        <span class="status-badge ${user.phoneVerified ? 'status-verified' : 'status-pending'}">
            <i class="fas fa-phone"></i> Phone ${user.phoneVerified ? 'Verified' : 'Pending'}
        </span>
        <span class="status-badge ${user.documentVerified ? 'status-verified' : 'status-pending'}">
            <i class="fas fa-id-card"></i> Document ${user.documentVerified ? 'Verified' : 'Pending'}
        </span>
    `;
}

function checkVerificationStatus(user) {
    const phoneSection = document.getElementById('phone-verification-section');
    const documentSection = document.getElementById('document-upload-section');
    const mainDashboard = document.getElementById('main-dashboard');

    if (!user.phoneVerified) {
        phoneSection.classList.remove('hidden');
        mainDashboard.classList.add('hidden');
    } else if (!user.documentVerified) {
        phoneSection.classList.add('hidden');
        documentSection.classList.remove('hidden');
        mainDashboard.classList.add('hidden');
    } else {
        phoneSection.classList.add('hidden');
        documentSection.classList.add('hidden');
        mainDashboard.classList.remove('hidden');
        
        // Initialize map when main dashboard is shown
        setTimeout(() => {
            initializeMap();
            loadEmergencyContacts();
        }, 500);
    }
}

// Phone verification functions
async function sendOTP() {
    try {
        const response = await apiCall('/api/phone-verification/send-otp', {
            method: 'POST'
        });

        if (response.success) {
            showAlert('OTP sent to your phone number', 'success');
            document.getElementById('otp-input-section').classList.remove('hidden');
        }
    } catch (error) {
        showAlert(error.message || 'Failed to send OTP', 'danger');
    }
}

async function verifyOTP() {
    const otp = document.getElementById('otp').value;
    
    if (!otp || otp.length !== 6) {
        showAlert('Please enter a valid 6-digit OTP', 'danger');
        return;
    }

    try {
        const response = await apiCall('/api/phone-verification/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ otp })
        });

        if (response.success) {
            showAlert('Phone number verified successfully!', 'success');
            currentUser.phoneVerified = true;
            checkVerificationStatus(currentUser);
            displayUserInfo(currentUser);
        }
    } catch (error) {
        showAlert(error.message || 'OTP verification failed', 'danger');
    }
}

// Document upload
document.addEventListener('DOMContentLoaded', function() {
    const documentForm = document.getElementById('documentForm');
    if (documentForm) {
        documentForm.addEventListener('submit', handleDocumentUpload);
    }

    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleAddContact);
    }
});

async function handleDocumentUpload(e) {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Validate form inputs
    const documentType = document.getElementById('documentType').value;
    const documentNumber = document.getElementById('documentNumber').value;
    const documentFile = document.getElementById('documentFile').files[0];

    if (!documentType || !documentNumber || !documentFile) {
        showAlert('All fields are required', 'danger');
        return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(documentFile.type)) {
        showAlert('Only JPEG, JPG, PNG and PDF files are allowed', 'danger');
        return;
    }

    // Validate file size (5MB)
    if (documentFile.size > 5 * 1024 * 1024) {
        showAlert('File size must be less than 5MB', 'danger');
        return;
    }

    try {
        // Show loading state
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('documentType', documentType);
        formData.append('documentNumber', documentNumber);
        formData.append('document', documentFile);

        const response = await apiCall('/api/documents/upload', {
            method: 'POST',
            body: formData
            // Don't set headers - let browser handle multipart boundary
        });

        if (response.success) {
            showAlert('Document uploaded successfully! It will be reviewed by admin.', 'success');
            document.getElementById('documentForm').reset();
            
            // Reload user profile to update verification status
            setTimeout(() => loadUserProfile(true), 1000);
        } else {
            throw new Error(response.message || 'Upload failed');
        }
    } catch (error) {
        console.error('Document upload error:', error);
        
        // Handle specific error types
        let errorMessage = 'Document upload failed';
        if (error.response && error.response.error === 'UPLOAD_ERROR') {
            errorMessage = error.message;
        } else if (error.response && error.response.error === 'INVALID_JSON_RESPONSE') {
            errorMessage = 'Server error - please try again later';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showAlert(errorMessage, 'danger');
    } finally {
        // Reset button state
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// SOS functionality
function startSOS(e) {
    e.preventDefault();
    
    if (!currentUser || !currentUser.isFullyVerified) {
        showAlert('Please complete phone and document verification to use SOS features.', 'warning');
        return;
    }

    const sosButton = document.getElementById('sosButton');
    const sosProgress = document.getElementById('sos-progress');
    
    if (sosTimeout) {
        clearTimeout(sosTimeout);
    }

    // Visual feedback
    sosButton.classList.add('sos-active');
    sosButton.style.transform = 'scale(1.1)';
    
    // Start 3-second countdown
    sosTimeout = setTimeout(() => {
        sendSOSAlert();
    }, 3000);

    // Show progress indicator
    if (sosProgress) {
        sosProgress.classList.remove('hidden');
    }

    console.log('SOS countdown started');
}

function cancelSOS(e) {
    e.preventDefault();
    
    if (sosTimeout) {
        clearTimeout(sosTimeout);
        sosTimeout = null;
    }

    const sosButton = document.getElementById('sosButton');
    const sosProgress = document.getElementById('sos-progress');
    
    // Reset visual feedback
    sosButton.classList.remove('sos-active');
    sosButton.style.transform = 'scale(1)';
    
    // Hide progress indicator
    if (sosProgress) {
        sosProgress.classList.add('hidden');
    }

    console.log('SOS cancelled');
}

async function sendSOSAlert() {
    try {
        const sosProgress = document.getElementById('sos-progress');
        if (sosProgress) {
            sosProgress.innerHTML = '<div class="spinner"></div><p>Sending emergency alert...</p>';
        }

        // Get current location if available
        let location = null;
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 5000,
                        enableHighAccuracy: true
                    });
                });
                location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
            } catch (error) {
                console.log('Could not get location:', error);
            }
        }

        const response = await apiCall('/api/emergency/sos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                location: location,
                timestamp: new Date().toISOString()
            })
        });

        if (response.success) {
            showAlert('🚨 Emergency alert sent successfully! Help is on the way.', 'success');
            
            // Update progress indicator
            if (sosProgress) {
                sosProgress.innerHTML = `
                    <div style="color: #4CAF50;">
                        <i class="fas fa-check-circle"></i>
                        <p>Emergency alert sent!</p>
                        <small>Alert ID: ${response.alertId || 'N/A'}</small>
                    </div>
                `;
                
                // Hide after 5 seconds
                setTimeout(() => {
                    sosProgress.classList.add('hidden');
                }, 5000);
            }
        } else {
            throw new Error(response.message || 'Failed to send SOS alert');
        }
    } catch (error) {
        console.error('SOS Alert Error:', error);
        showAlert('Failed to send emergency alert. Please try calling emergency services directly.', 'error');
        
        const sosProgress = document.getElementById('sos-progress');
        if (sosProgress) {
            sosProgress.innerHTML = `
                <div style="color: #f44336;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Alert failed to send</p>
                    <button class="btn btn-sm btn-primary" onclick="sendSOSAlert()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    } finally {
        // Reset SOS button
        const sosButton = document.getElementById('sosButton');
        if (sosButton) {
            sosButton.classList.remove('sos-active');
            sosButton.style.transform = 'scale(1)';
        }
    }
}

// Get current location using geolocation API
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                let errorMessage = 'Unable to get location';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Location access denied by user';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Location information unavailable';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Location request timed out';
                        break;
                }
                reject(new Error(errorMessage));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}

// Emergency numbers
function callNumber(number) {
    if (confirm(`Call ${number}?`)) {
        window.location.href = `tel:${number}`;
    }
}

// Prevent repeated profile loading with persistent storage
let profileLoadInProgress = false;
let lastProfileLoadTime = parseInt(localStorage.getItem('lastProfileLoad') || '0');
const PROFILE_LOAD_COOLDOWN = 10000; // 10 seconds

// Tourist spots data (Delhi landmarks)
const touristSpots = [
    {
        name: "Red Fort",
        coords: [28.6562, 77.2410],
        description: "Historic Mughal fortress and UNESCO World Heritage Site",
        type: "historical"
    },
    {
        name: "India Gate",
        coords: [28.6129, 77.2295],
        description: "War memorial and iconic landmark of Delhi",
        type: "monument"
    },
    {
        name: "Lotus Temple",
        coords: [28.5535, 77.2588],
        description: "Bahá'í House of Worship known for its lotus-shaped architecture",
        type: "religious"
    },
    {
        name: "Qutub Minar",
        coords: [28.5245, 77.1855],
        description: "UNESCO World Heritage Site and tallest brick minaret",
        type: "historical"
    },
    {
        name: "Humayun's Tomb",
        coords: [28.5933, 77.2507],
        description: "Mughal Emperor's tomb and UNESCO World Heritage Site",
        type: "historical"
    },
    {
        name: "Akshardham Temple",
        coords: [28.6127, 77.2773],
        description: "Modern Hindu temple complex with stunning architecture",
        type: "religious"
    }
];

// Restricted areas data
const restrictedAreas = [
    {
        name: "Military Cantonment Area",
        coords: [28.5800, 77.1600],
        radius: 1000,
        description: "Military restricted zone - Entry prohibited"
    },
    {
        name: "Airport Security Zone",
        coords: [28.5665, 77.1031],
        radius: 2000,
        description: "Airport security perimeter - Restricted access"
    },
    {
        name: "Government Secretariat",
        coords: [28.6139, 77.2090],
        radius: 500,
        description: "High security government area - Limited access"
    }
];

// Initialize map
function initializeMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    // Clear any existing map
    if (map) {
        map.remove();
        map = null;
    }

    try {
        // Initialize map centered on Delhi
        map = L.map('map').setView([28.6139, 77.2090], 12);

        // Add tile layer with fallback for offline
        const onlineLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        });

        onlineLayer.on('tileerror', function() {
            console.log('Switching to offline mode');
            createOfflineMap();
        });

        map.addLayer(onlineLayer);

        // Add user location if available
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    
                    // Add user marker
                    userMarker = L.marker([userLat, userLng], {
                        icon: L.divIcon({
                            className: 'user-marker',
                            html: '<div style="background: #4CAF50; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">📍</div>',
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })
                    }).addTo(map).bindPopup('Your Location');
                    
                    // Center map on user location
                    map.setView([userLat, userLng], 14);
                },
                (error) => {
                    console.log('Geolocation error:', error);
                    showAlert('Location access denied. Using default location.', 'warning');
                }
            );
        }

        // Add tourist spots and safety markers
        addTouristSpots();
        addRestrictedAreas();
        addSafetyMarkers();
        addLayerControl();

        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
        showAlert('Failed to load map. Please refresh the page.', 'error');
    }
}

function addTouristSpots() {
    touristSpots.forEach(spot => {
        // Create custom icon based on type
        let iconClass = 'fas fa-map-marker-alt';
        let iconColor = '#28a745';
        
        switch(spot.type) {
            case 'historical':
                iconClass = 'fas fa-landmark';
                iconColor = '#ffc107';
                break;
            case 'religious':
                iconClass = 'fas fa-place-of-worship';
                iconColor = '#17a2b8';
                break;
            case 'monument':
                iconClass = 'fas fa-monument';
                iconColor = '#6f42c1';
                break;
        }

        const customIcon = L.divIcon({
            className: 'tourist-spot-marker',
            html: `<i class="${iconClass}" style="color: ${iconColor}; font-size: 20px;"></i>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const marker = L.marker(spot.coords, { icon: customIcon })
            .bindPopup(`
                <div class="map-popup">
                    <h4>${spot.name}</h4>
                    <p>${spot.description}</p>
                    <small><strong>Type:</strong> ${spot.type}</small>
                </div>
            `)
            .bindTooltip(spot.name, { 
                permanent: false, 
                direction: 'top',
                offset: [0, -10]
            });

        L.layerGroup().addLayer(marker).addTo(map);
    });
}

function addRestrictedAreas() {
    restrictedAreas.forEach(area => {
        // Create circle for restricted area
        const circle = L.circle(area.coords, {
            color: '#dc3545',
            fillColor: '#dc3545',
            fillOpacity: 0.2,
            radius: area.radius,
            weight: 2
        }).bindPopup(`
            <div class="map-popup restricted-popup">
                <h4 style="color: #dc3545;"><i class="fas fa-exclamation-triangle"></i> ${area.name}</h4>
                <p>${area.description}</p>
                <small><strong>Radius:</strong> ${area.radius}m</small>
            </div>
        `).bindTooltip(`⚠️ ${area.name}`, { 
            permanent: false, 
            direction: 'center',
            className: 'restricted-tooltip'
        });

        L.layerGroup().addLayer(circle).addTo(map);
    });
}

function addSafetyMarkers() {
    // Safe zones (green circles)
    const safeZones = [
        {lat: 28.6129, lng: 77.2295, name: "India Gate - Safe Zone"},
        {lat: 28.6562, lng: 77.2410, name: "Red Fort - Safe Zone"},
        {lat: 28.5535, lng: 77.2588, name: "Lotus Temple - Safe Zone"}
    ];

    safeZones.forEach(zone => {
        L.circle([zone.lat, zone.lng], {
            color: '#4CAF50',
            fillColor: '#4CAF50',
            fillOpacity: 0.3,
            radius: 500
        }).addTo(map).bindPopup(`🟢 ${zone.name}`);
    });

    // Restricted areas (red circles)
    const restrictedZones = [
        {lat: 28.6328, lng: 77.2197, name: "Construction Zone - Restricted"},
        {lat: 28.6445, lng: 77.2167, name: "High Crime Area - Avoid"}
    ];

    restrictedZones.forEach(zone => {
        L.circle([zone.lat, zone.lng], {
            color: '#f44336',
            fillColor: '#f44336',
            fillOpacity: 0.3,
            radius: 300
        }).addTo(map).bindPopup(`🔴 ${zone.name}`);
    });

    // Emergency services (blue markers)
    const emergencyServices = [
        {lat: 28.6139, lng: 77.2090, name: "Police Station", type: "police"},
        {lat: 28.6289, lng: 77.2065, name: "Hospital", type: "hospital"},
        {lat: 28.6089, lng: 77.2190, name: "Fire Station", type: "fire"}
    ];

    emergencyServices.forEach(service => {
        const icon = service.type === 'police' ? '👮' : service.type === 'hospital' ? '🏥' : '🚒';
        
        L.marker([service.lat, service.lng], {
            icon: L.divIcon({
                className: 'emergency-marker',
                html: `<div style="background: #2196F3; color: white; width: 30px; height: 30px; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${icon}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }).addTo(map).bindPopup(`🔵 ${service.name}`);
    });
}

function addLayerControl() {
    const overlayMaps = {
        "🏛️ Tourist Spots": L.layerGroup().addTo(map),
        "⚠️ Restricted Areas": L.layerGroup().addTo(map)
    };

    L.control.layers(null, overlayMaps, {
        position: 'topright',
        collapsed: false
    }).addTo(map);
}

function createOfflineMap() {
    // Create offline SVG background
    const svgBackground = `data:image/svg+xml;base64,${btoa(`
        <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e0e0e0" stroke-width="1"/>
                </pattern>
            </defs>
            <rect width="256" height="256" fill="#f5f5f5"/>
            <rect width="256" height="256" fill="url(#grid)"/>
            <text x="128" y="128" text-anchor="middle" font-family="Arial" font-size="14" fill="#666">
                Delhi Area (Offline Mode)
            </text>
        </svg>
    `)}`;

    const offlineLayer = L.tileLayer(svgBackground, {
        attribution: '📡 OFFLINE MODE - Safety features active',
        maxZoom: 19
    });

    map.addLayer(offlineLayer);
    
    // Add offline mode indicator
    const offlineIndicator = L.control({position: 'topright'});
    offlineIndicator.onAdd = function() {
        const div = L.DomUtil.create('div', 'offline-indicator');
        div.innerHTML = '<div style="background: #ff9800; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px; font-weight: bold;">📡 OFFLINE MODE</div>';
        return div;
    };
    offlineIndicator.addTo(map);
}

// Prevent repeated contacts loading with persistent storage
let contactsLoadInProgress = false;
let lastContactsLoadTime = parseInt(localStorage.getItem('lastContactsLoad') || '0');
const CONTACTS_LOAD_COOLDOWN = 8000; // 8 seconds

// Emergency contacts management
async function loadEmergencyContacts() {
    // Prevent repeated calls within cooldown period
    const now = Date.now();
    if (contactsLoadInProgress || (now - lastContactsLoadTime < CONTACTS_LOAD_COOLDOWN)) {
        console.log('Contacts load skipped - cooldown active or already in progress');
        return;
    }
    
    contactsLoadInProgress = true;
    lastContactsLoadTime = now;
    localStorage.setItem('lastContactsLoad', now.toString());
    
    try {
        const response = await apiCall('/api/emergency/contacts');
        if (response.success) {
            displayContacts(response.contacts);
        } else {
            throw new Error(response.message || 'Failed to load contacts');
        }
    } catch (error) {
        console.error('Failed to load contacts:', error);
        
        // Handle rate limiting specifically
        if (error.status === 429) {
            const retryAfter = error.retryAfter || 60;
            showAlert(`Rate limited. Please wait ${retryAfter} seconds before loading contacts.`, 'warning');
            
            const contactsList = document.getElementById('contacts-list');
            if (contactsList) {
                contactsList.innerHTML = `
                    <div class="text-center" style="color: #f39c12; padding: 20px;">
                        <i class="fas fa-clock"></i>
                        <p>Rate limited - please wait ${retryAfter}s</p>
                        <button class="btn btn-sm btn-secondary" id="retry-contacts-rate-limit">
                            <i class="fas fa-refresh"></i> Retry
                        </button>
                    </div>`;
                
                // Add event listener for retry button
                const retryBtn = document.getElementById('retry-contacts-rate-limit');
                if (retryBtn) retryBtn.addEventListener('click', loadEmergencyContacts);
            }
        } else {
            showAlert('Failed to load emergency contacts', 'warning');
            
            // Show placeholder UI
            const contactsList = document.getElementById('contacts-list');
            if (contactsList) {
                contactsList.innerHTML = `
                    <div class="text-center" style="color: #666; padding: 20px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Unable to load emergency contacts</p>
                        <button class="btn btn-sm btn-secondary" id="retry-contacts-error">
                            <i class="fas fa-refresh"></i> Retry
                        </button>
                    </div>
                `;
                
                // Add event listener for retry button
                const retryBtn = document.getElementById('retry-contacts-error');
                if (retryBtn) retryBtn.addEventListener('click', loadEmergencyContacts);
            }
        }
    } finally {
        contactsLoadInProgress = false;
    }
}

function displayContacts(contacts) {
    const contactsList = document.getElementById('contacts-list');
    
    if (contacts.length === 0) {
        contactsList.innerHTML = '<p class="text-center">No emergency contacts added yet.</p>';
        return;
    }

    contactsList.innerHTML = contacts.map(contact => `
        <div class="contact-item">
            <div class="contact-info">
                <h4>${contact.name}</h4>
                <p>${contact.phone} | ${contact.relationship} | Priority: ${contact.priority}</p>
            </div>
            <div class="contact-actions">
                <button class="btn btn-sm btn-primary" data-phone="${contact.phone}">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="btn btn-sm btn-danger" data-contact-id="${contact._id}">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="btn btn-sm btn-secondary" data-contact-id="${contact._id}">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Contact management functions
async function addContact(contactData) {
    try {
        const response = await apiCall('/api/emergency/contacts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(contactData)
        });

        if (response.success) {
            showAlert('Emergency contact added successfully!', 'success');
            loadEmergencyContacts(true); // Force refresh
            closeContactModal();
        } else {
            throw new Error(response.message || 'Failed to add contact');
        }
    } catch (error) {
        console.error('Error adding contact:', error);
        showAlert(error.message || 'Failed to add contact', 'error');
    }
}

async function deleteContact(contactId) {
    if (!confirm('Are you sure you want to delete this contact?')) {
        return;
    }

    try {
        const response = await apiCall(`/api/emergency/contacts/${contactId}`, {
            method: 'DELETE'
        });

        if (response.success) {
            showAlert('Contact deleted successfully', 'success');
            loadEmergencyContacts(true); // Force refresh
        }
    } catch (error) {
        console.error('Error deleting contact:', error);
        showAlert(error.message || 'Failed to delete contact', 'error');
    }
}

function editContact(contactId) {
    // Find the contact in the current list
    const contactCard = document.querySelector(`[data-contact-id="${contactId}"]`);
    if (!contactCard) return;

    // Extract contact info from the card
    const name = contactCard.querySelector('h4').textContent;
    const phone = contactCard.querySelector('.fa-phone').parentElement.textContent.replace('📞', '').trim();
    const relationship = contactCard.querySelector('.fa-user').parentElement.textContent.replace('👤', '').trim();
    const priority = contactCard.querySelector('.priority-badge').textContent.replace('Priority ', '');

    // Populate the form with existing data
    document.getElementById('contactName').value = name;
    document.getElementById('contactPhone').value = phone;
    document.getElementById('contactRelationship').value = relationship;
    document.getElementById('contactPriority').value = priority;

    // Show modal and set edit mode
    showContactModal();
    
    // Change form submission to update instead of create
    const form = document.getElementById('contactForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await updateContact(contactId);
    };
}

async function updateContact(contactId) {
    const contactData = {
        name: document.getElementById('contactName').value,
        phone: document.getElementById('contactPhone').value,
        relationship: document.getElementById('contactRelationship').value,
        priority: parseInt(document.getElementById('contactPriority').value)
    };

    try {
        const response = await apiCall(`/api/emergency/contacts/${contactId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(contactData)
        });

        if (response.success) {
            showAlert('Contact updated successfully!', 'success');
            loadEmergencyContacts(true); // Force refresh
            closeContactModal();
        } else {
            throw new Error(response.message || 'Failed to update contact');
        }
    } catch (error) {
        console.error('Error updating contact:', error);
        showAlert(error.message || 'Failed to update contact', 'error');
    }
}

function showContactModal() {
    document.getElementById('contactModal').classList.remove('hidden');
}

function closeContactModal() {
    document.getElementById('contactModal').classList.add('hidden');
    document.getElementById('contactForm').reset();
    
    // Reset form submission to create mode
    const form = document.getElementById('contactForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const contactData = {
            name: document.getElementById('contactName').value,
            phone: document.getElementById('contactPhone').value,
            relationship: document.getElementById('contactRelationship').value,
            priority: parseInt(document.getElementById('contactPriority').value)
        };
        await addContact(contactData);
    };
}

// Modal utility functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

function showAddContactModal() {
    showModal('contactModal');
}

function hideAddContactModal() {
    hideModal('contactModal');
}

function closeContactModal() {
    hideModal('contactModal');
    document.getElementById('contactForm').reset();
}

async function handleAddContact(e) {
    e.preventDefault();
    
    const form = e.target;
    const data = {
        name: form.contactName.value,
        phone: form.contactPhone.value,
        relationship: form.contactRelationship.value,
        priority: parseInt(form.contactPriority.value)
    };

    try {
        const response = await apiCall('/api/emergency/contacts', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (response.success) {
            showAlert('Emergency contact added successfully!', 'success');
            closeContactModal();
            loadEmergencyContacts();
        }
    } catch (error) {
        showAlert(error.message || 'Failed to add contact', 'danger');
    }
}

async function deleteContact(contactId) {
    if (!confirm('Are you sure you want to delete this contact?')) {
        return;
    }

    try {
        const response = await apiCall(`/api/emergency/contacts/${contactId}`, {
            method: 'DELETE'
        });

        if (response.success) {
            showAlert('Contact deleted successfully', 'success');
            loadEmergencyContacts();
        }
    } catch (error) {
        showAlert(error.message || 'Failed to delete contact', 'danger');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/dashboard') {
        initializeDashboard();
        
        // Add event listeners for buttons
        document.getElementById('logout-btn')?.addEventListener('click', logout);
        document.getElementById('send-otp-btn')?.addEventListener('click', sendOTP);
        document.getElementById('verify-otp-btn')?.addEventListener('click', verifyOTP);
        document.getElementById('add-contact-btn')?.addEventListener('click', showContactModal);
        document.getElementById('close-contact-modal')?.addEventListener('click', closeContactModal);
        
        // Contact form submission
        document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const contactData = {
                name: document.getElementById('contactName').value,
                phone: document.getElementById('contactPhone').value,
                relationship: document.getElementById('contactRelationship').value,
                priority: parseInt(document.getElementById('contactPriority').value)
            };
            await addContact(contactData);
        });

        // Emergency numbers click to call
        document.querySelectorAll('.feature-card[data-number]').forEach(card => {
            card.addEventListener('click', () => {
                const number = card.getAttribute('data-number');
                if (confirm(`Call ${number}?`)) {
                    window.location.href = `tel:${number}`;
                }
            });
        });

        console.log('Dashboard initialized successfully');
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        showAlert('Failed to initialize dashboard. Please refresh the page.', 'error');
    }
});
