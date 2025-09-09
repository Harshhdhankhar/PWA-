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
            // Ensure Leaflet is loaded before initializing map
            if (typeof L !== 'undefined') {
                initializeMap();
            } else {
                console.error('Leaflet library not loaded');
                // Retry after a short delay
                setTimeout(() => {
                    if (typeof L !== 'undefined') {
                        initializeMap();
                    }
                }, 1000);
            }
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

// Document upload event listener - moved to main initialization

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
    
    // Start 2-second countdown for faster response
    sosTimeout = setTimeout(() => {
        sendSOSAlert();
    }, 2000);

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

        // Ensure we have location coordinates - use default if geolocation failed
        if (!location) {
            location = {
                latitude: 28.6139, // Default to Delhi coordinates
                longitude: 77.2090
            };
            console.log('Using default location (Delhi) as geolocation failed');
        }

        const response = await apiCall('/api/emergency/sos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                latitude: location.latitude,
                longitude: location.longitude,
                address: location.address || 'Location not available',
                alertType: 'emergency',
                timestamp: new Date().toISOString()
            })
        });

        if (response && response.success) {
            showAlert('🚨 Emergency alert sent successfully! Help is on the way.', 'success');
            
            // Update progress indicator
            if (sosProgress) {
                sosProgress.innerHTML = `
                    <div style="color: #4CAF50;">
                        <i class="fas fa-check-circle"></i>
                        <p>Emergency alert sent!</p>
                        <small>Alert ID: ${response.alert?.id || 'N/A'}</small>
                        <small>Contacts notified: ${response.alert?.contactsNotified || 0}</small>
                    </div>
                `;
                
                // Hide after 5 seconds
                setTimeout(() => {
                    sosProgress.classList.add('hidden');
                }, 5000);
            }
        } else {
            throw new Error(response?.message || 'Failed to send SOS alert');
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

    // Check if Leaflet is available
    if (typeof L === 'undefined') {
        console.error('Leaflet library not available');
        return;
    }

    // Clear any existing map
    if (map) {
        map.remove();
        map = null;
    }

    try {
        console.log('Initializing map...');
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
async function loadEmergencyContacts(forceRefresh = false) {
    // Skip cooldown if force refresh is requested
    if (!forceRefresh) {
        // Prevent repeated calls within cooldown period
        const now = Date.now();
        if (contactsLoadInProgress || (now - lastContactsLoadTime < CONTACTS_LOAD_COOLDOWN)) {
            console.log('Contacts load skipped - cooldown active or already in progress');
            return;
        }
    }
    
    contactsLoadInProgress = true;
    const now = Date.now();
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
                document.getElementById('retry-contacts-rate-limit')?.addEventListener('click', () => {
                    loadEmergencyContacts(true);
                });
            }
        } else {
            showAlert('Failed to load emergency contacts. Please refresh the page.', 'error');
            
            const contactsList = document.getElementById('contacts-list');
            if (contactsList) {
                contactsList.innerHTML = `
                    <div class="text-center" style="color: #666; padding: 20px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Unable to load contacts</p>
                        <button class="btn btn-sm btn-secondary" id="retry-contacts-error">
                            <i class="fas fa-refresh"></i> Retry
                        </button>
                    </div>`;
                
                document.getElementById('retry-contacts-error')?.addEventListener('click', () => {
                    loadEmergencyContacts(true);
                });
            }
        }
    } finally {
        contactsLoadInProgress = false;
    }
}

function displayContacts(contacts) {
    const contactsList = document.getElementById('contacts-list');
    if (!contactsList) return;

    if (!contacts || contacts.length === 0) {
        contactsList.innerHTML = `
            <div class="text-center" style="color: #666; padding: 20px;">
                <i class="fas fa-address-book"></i>
                <p>No emergency contacts added yet</p>
                <p><small>Add contacts to receive emergency notifications</small></p>
            </div>
        `;
        return;
    }

    contactsList.innerHTML = contacts.map(contact => `
        <div class="contact-card" data-contact-id="${contact._id}">
            <div class="contact-info">
                <h4>${contact.name}</h4>
                <p><i class="fas fa-phone"></i> ${contact.phone}</p>
                <p><i class="fas fa-user"></i> ${contact.relationship}</p>
                <span class="priority-badge priority-${contact.priority}">
                    Priority ${contact.priority}
                </span>
            </div>
            <div class="contact-actions">
                <button class="btn btn-sm btn-primary" onclick="editContact('${contact._id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteContact('${contact._id}')">
                    <i class="fas fa-trash"></i>
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
    const phoneText = contactCard.querySelector('.fa-phone').parentElement.textContent;
    const phone = phoneText.replace(/.*\s/, '').trim(); // Get text after icon
    const relationshipText = contactCard.querySelector('.fa-user').parentElement.textContent;
    const relationship = relationshipText.replace(/.*\s/, '').trim(); // Get text after icon
    const priorityText = contactCard.querySelector('.priority-badge').textContent;
    const priority = priorityText.replace('Priority ', '');

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
    
    // Form submission is already handled by the main event listener on line 157
    // No need to reassign onsubmit here
}


// Mock Data for New Features
const mockAlertHistory = [
    {
        id: 1,
        date: '2025-09-07',
        time: '14:30',
        location: 'Connaught Place, New Delhi',
        coordinates: [28.6315, 77.2167],
        status: 'resolved',
        type: 'SOS Alert'
    },
    {
        id: 2,
        date: '2025-09-06',
        time: '09:15',
        location: 'India Gate, New Delhi',
        coordinates: [28.6129, 77.2295],
        status: 'resolved',
        type: 'Emergency Contact'
    },
    {
        id: 3,
        date: '2025-09-05',
        time: '18:45',
        location: 'Red Fort, New Delhi',
        coordinates: [28.6562, 77.2410],
        status: 'pending',
        type: 'Voice SOS'
    }
];

const mockVolunteers = [
    {
        id: 1,
        name: 'Rajesh Kumar',
        rating: 4.8,
        distance: '0.5 km',
        coordinates: [28.6139, 77.2090],
        skills: ['First Aid', 'Local Guide', 'Hindi/English'],
        available: true
    },
    {
        id: 2,
        name: 'Priya Sharma',
        rating: 4.9,
        distance: '1.2 km',
        coordinates: [28.6200, 77.2100],
        skills: ['Medical', 'Women Safety', 'Emergency Response'],
        available: true
    },
    {
        id: 3,
        name: 'Mohammed Ali',
        rating: 4.7,
        distance: '2.1 km',
        coordinates: [28.6050, 77.2150],
        skills: ['Transportation', 'Local Knowledge', 'Urdu/Hindi'],
        available: false
    }
];

// Speech Recognition Variables
let recognition = null;
let isRecording = false;

// Tab Navigation
function initializeTabNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active tab
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active pane
            tabPanes.forEach(pane => pane.classList.remove('active'));
            const targetPane = document.getElementById(`${targetTab}-tab`);
            if (targetPane) {
                targetPane.classList.add('active');
                
                // Initialize tab-specific content
                switch(targetTab) {
                    case 'history':
                        loadAlertHistory();
                        initializeLastLocationMap();
                        break;
                    case 'tracking':
                        initializeTrackingMap();
                        break;
                    case 'volunteers':
                        loadVolunteers();
                        initializeVolunteersMap();
                        break;
                }
            }
        });
    });
}

// Alert History Functions
function loadAlertHistory() {
    const historyList = document.getElementById('alert-history-list');
    if (!historyList) return;
    
    historyList.innerHTML = mockAlertHistory.map(alert => `
        <div class="alert-item ${alert.status}">
            <div class="alert-header">
                <span class="alert-type">${alert.type}</span>
                <span class="alert-status ${alert.status}">${alert.status.toUpperCase()}</span>
            </div>
            <div class="alert-details">
                <p><i class="fas fa-calendar"></i> ${alert.date} at ${alert.time}</p>
                <p><i class="fas fa-map-marker-alt"></i> ${alert.location}</p>
            </div>
        </div>
    `).join('');
    
    // Update stats
    document.getElementById('total-alerts').textContent = mockAlertHistory.length;
    document.getElementById('resolved-alerts').textContent = 
        mockAlertHistory.filter(a => a.status === 'resolved').length;
}

function initializeLastLocationMap() {
    const mapContainer = document.getElementById('last-location-map');
    if (!mapContainer) return;
    
    // Clear existing map
    mapContainer.innerHTML = '';
    
    const lastLocation = mockAlertHistory[0];
    const miniMap = L.map(mapContainer).setView(lastLocation.coordinates, 15);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMap);
    
    L.marker(lastLocation.coordinates)
        .addTo(miniMap)
        .bindPopup(`Last known location: ${lastLocation.location}`)
        .openPopup();
}

// Voice/Text Emergency Access
function initializeAccessibilityFeatures() {
    const voiceBtn = document.getElementById('voice-sos-btn');
    const textBtn = document.getElementById('text-sos-btn');
    const textInput = document.getElementById('text-sos-input');
    const sendTextBtn = document.getElementById('send-text-sos');
    
    if (voiceBtn) {
        voiceBtn.addEventListener('click', toggleVoiceRecording);
    }
    
    if (textBtn) {
        textBtn.addEventListener('click', () => {
            textInput.classList.toggle('hidden');
        });
    }
    
    if (sendTextBtn) {
        sendTextBtn.addEventListener('click', sendTextEmergency);
    }
    
    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            handleVoiceEmergency(transcript);
        };
        
        recognition.onerror = function(event) {
            showAlert('Voice recognition error. Please try again.', 'error');
            stopVoiceRecording();
        };
        
        recognition.onend = function() {
            stopVoiceRecording();
        };
    }
}

function toggleVoiceRecording() {
    if (!recognition) {
        showAlert('Voice recognition not supported in this browser', 'error');
        return;
    }
    
    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

function startVoiceRecording() {
    isRecording = true;
    const voiceBtn = document.getElementById('voice-sos-btn');
    const voiceStatus = document.getElementById('voice-status');
    
    voiceBtn.classList.add('recording');
    voiceBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Recording';
    
    voiceStatus.classList.remove('hidden');
    voiceStatus.innerHTML = '<i class="fas fa-microphone"></i> Listening... Speak your emergency message';
    
    recognition.start();
}

function stopVoiceRecording() {
    isRecording = false;
    const voiceBtn = document.getElementById('voice-sos-btn');
    const voiceStatus = document.getElementById('voice-status');
    
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '<i class="fas fa-microphone"></i> Voice SOS';
    
    voiceStatus.classList.add('hidden');
    
    if (recognition) {
        recognition.stop();
    }
}

function handleVoiceEmergency(transcript) {
    showAlert(`Voice Emergency Detected: "${transcript}" - Mock SOS alert sent!`, 'success');
    // In real implementation, this would trigger the same SOS flow
}

function sendTextEmergency() {
    const emergencyText = document.getElementById('emergency-text').value.trim();
    if (!emergencyText) {
        showAlert('Please enter an emergency message', 'warning');
        return;
    }
    
    showAlert(`Text Emergency: "${emergencyText}" - Mock SOS alert sent!`, 'success');
    document.getElementById('emergency-text').value = '';
    document.getElementById('text-sos-input').classList.add('hidden');
}

// e-FIR Functions
function initializeEFIR() {
    const reportBtn = document.getElementById('report-missing-btn');
    const efirModal = document.getElementById('efirModal');
    const previewBtn = document.getElementById('preview-efir-btn');
    const submitBtn = document.getElementById('submit-efir-final-btn');
    const downloadBtn = document.getElementById('download-efir-btn');
    
    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            efirModal.classList.remove('hidden');
        });
    }
    
    if (previewBtn) {
        previewBtn.addEventListener('click', generateEFIRPreview);
    }
    
    if (submitBtn) {
        submitBtn.addEventListener('click', submitEFIR);
    }
    
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadEFIRPDF);
    }
    
    // Close modal handlers
    document.getElementById('close-efir-modal')?.addEventListener('click', () => {
        efirModal.classList.add('hidden');
    });
    
    document.getElementById('close-preview-modal')?.addEventListener('click', () => {
        document.getElementById('efirPreviewModal').classList.add('hidden');
    });
}

function generateEFIRPreview() {
    const formData = {
        name: document.getElementById('missingName').value,
        age: document.getElementById('missingAge').value,
        description: document.getElementById('missingDescription').value,
        lastSeenLocation: document.getElementById('lastSeenLocation').value,
        lastSeenDate: document.getElementById('lastSeenDate').value,
        lastSeenTime: document.getElementById('lastSeenTime').value,
        reporterContact: document.getElementById('reporterContact').value
    };
    
    if (!formData.name || !formData.age || !formData.description) {
        showAlert('Please fill in all required fields', 'warning');
        return;
    }
    
    const previewContent = document.getElementById('efir-preview-content');
    const firNumber = 'FIR-' + Date.now().toString().slice(-6);
    
    previewContent.innerHTML = `
        <div class="efir-header">
            <h2>ELECTRONIC FIRST INFORMATION REPORT (e-FIR)</h2>
            <h3>MISSING PERSON REPORT</h3>
            <p><strong>FIR No:</strong> ${firNumber}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="efir-body">
            <div class="efir-field">
                <strong>Missing Person Name:</strong> ${formData.name}
            </div>
            <div class="efir-field">
                <strong>Age:</strong> ${formData.age} years
            </div>
            <div class="efir-field">
                <strong>Physical Description:</strong> ${formData.description}
            </div>
            <div class="efir-field">
                <strong>Last Seen Location:</strong> ${formData.lastSeenLocation}
            </div>
            <div class="efir-field">
                <strong>Last Seen Date & Time:</strong> ${formData.lastSeenDate} at ${formData.lastSeenTime}
            </div>
            <div class="efir-field">
                <strong>Reporter Contact:</strong> ${formData.reporterContact}
            </div>
            <div class="efir-field">
                <strong>Report Filed On:</strong> ${new Date().toLocaleString()}
            </div>
        </div>
        
        <div class="efir-footer" style="margin-top: 30px; text-align: center; color: #666;">
            <p><em>This is a demo e-FIR. In actual implementation, this would be submitted to law enforcement.</em></p>
        </div>
    `;
    
    document.getElementById('efirPreviewModal').classList.remove('hidden');
}

function downloadEFIRPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const content = document.getElementById('efir-preview-content').innerText;
    const lines = doc.splitTextToSize(content, 180);
    
    doc.setFontSize(16);
    doc.text('e-FIR - Missing Person Report', 20, 20);
    
    doc.setFontSize(12);
    doc.text(lines, 20, 40);
    
    doc.save('eFIR-Missing-Person-Report.pdf');
    showAlert('e-FIR PDF downloaded successfully!', 'success');
}

function submitEFIR() {
    showAlert('e-FIR submitted successfully! (Demo Mode) - Reference ID: FIR-' + Date.now().toString().slice(-6), 'success');
    document.getElementById('efirPreviewModal').classList.add('hidden');
    document.getElementById('efirModal').classList.add('hidden');
    document.getElementById('efirForm').reset();
}

// Real-Time Tracking
let trackingMap = null;
let trackingMarker = null;
let trackingPath = [];
let trackingInterval = null;

function initializeTrackingMap() {
    const mapContainer = document.getElementById('tracking-map');
    if (!mapContainer) return;
    
    if (trackingMap) {
        trackingMap.remove();
    }
    
    trackingMap = L.map(mapContainer).setView([28.6139, 77.2090], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(trackingMap);
    
    const toggle = document.getElementById('live-tracking-toggle');
    if (toggle) {
        toggle.addEventListener('change', function() {
            if (this.checked) {
                startLiveTracking();
            } else {
                stopLiveTracking();
            }
        });
    }
}

function startLiveTracking() {
    showAlert('Live tracking started (Demo Mode)', 'success');
    
    // Simulate movement with mock coordinates
    const mockPath = [
        [28.6139, 77.2090],
        [28.6150, 77.2100],
        [28.6160, 77.2110],
        [28.6170, 77.2120],
        [28.6180, 77.2130]
    ];
    
    let pathIndex = 0;
    trackingPath = [];
    
    trackingInterval = setInterval(() => {
        if (pathIndex < mockPath.length) {
            const currentPos = mockPath[pathIndex];
            trackingPath.push(currentPos);
            
            if (trackingMarker) {
                trackingMarker.setLatLng(currentPos);
            } else {
                trackingMarker = L.marker(currentPos).addTo(trackingMap)
                    .bindPopup('Your current location');
            }
            
            // Draw path
            if (trackingPath.length > 1) {
                L.polyline(trackingPath, {color: 'blue', weight: 3}).addTo(trackingMap);
            }
            
            trackingMap.setView(currentPos, 15);
            
            // Update stats
            document.getElementById('distance-traveled').textContent = 
                ((pathIndex + 1) * 0.2).toFixed(1) + ' km';
            document.getElementById('tracking-duration').textContent = 
                Math.floor((pathIndex + 1) * 2 / 60) + 'h ' + ((pathIndex + 1) * 2 % 60) + 'm';
            
            pathIndex++;
        } else {
            pathIndex = 0; // Loop the path
        }
    }, 3000);
}

function stopLiveTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    showAlert('Live tracking stopped', 'info');
}

// Volunteers System
function loadVolunteers() {
    const volunteersList = document.getElementById('volunteers-list-container');
    if (!volunteersList) return;
    
    volunteersList.innerHTML = mockVolunteers.map(volunteer => `
        <div class="volunteer-item">
            <div class="volunteer-header">
                <span class="volunteer-name">${volunteer.name}</span>
                <span class="volunteer-rating">
                    ${'★'.repeat(Math.floor(volunteer.rating))} ${volunteer.rating}
                </span>
            </div>
            <div class="volunteer-distance">
                <i class="fas fa-map-marker-alt"></i> ${volunteer.distance} away
            </div>
            <div class="volunteer-skills">
                ${volunteer.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
            </div>
            <div style="margin-top: 10px;">
                <span class="badge ${volunteer.available ? 'badge-success' : 'badge-secondary'}">
                    ${volunteer.available ? 'Available' : 'Busy'}
                </span>
            </div>
        </div>
    `).join('');
}

function initializeVolunteersMap() {
    const mapContainer = document.getElementById('volunteers-map');
    if (!mapContainer) return;
    
    const volunteersMap = L.map(mapContainer).setView([28.6139, 77.2090], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(volunteersMap);
    
    // Add volunteer markers
    mockVolunteers.forEach(volunteer => {
        const icon = L.divIcon({
            html: `<div style="background: ${volunteer.available ? '#28a745' : '#6c757d'}; 
                   color: white; border-radius: 50%; width: 30px; height: 30px; 
                   display: flex; align-items: center; justify-content: center; 
                   font-weight: bold;">${volunteer.name.charAt(0)}</div>`,
            iconSize: [30, 30],
            className: 'volunteer-marker'
        });
        
        L.marker(volunteer.coordinates, {icon})
            .addTo(volunteersMap)
            .bindPopup(`
                <strong>${volunteer.name}</strong><br>
                Rating: ${volunteer.rating} ★<br>
                Distance: ${volunteer.distance}<br>
                Status: ${volunteer.available ? 'Available' : 'Busy'}
            `);
    });
    
    // Add user location
    L.marker([28.6139, 77.2090])
        .addTo(volunteersMap)
        .bindPopup('Your Location')
        .openPopup();
}

function requestVolunteerSupport() {
    showAlert('Volunteer support request sent! (Demo Mode) - Nearby volunteers have been notified.', 'success');
}

// Safety Score Calculation
function updateSafetyScore() {
    // Mock calculation based on various factors
    const factors = {
        locationSafety: Math.random() * 30 + 70, // 70-100
        timeOfDay: new Date().getHours() > 6 && new Date().getHours() < 22 ? 90 : 60,
        verificationStatus: currentUser?.isFullyVerified ? 95 : 50,
        emergencyContacts: Math.min((currentUser?.emergencyContacts?.length || 0) * 10, 30),
        recentActivity: 85
    };
    
    const score = Math.round(
        (factors.locationSafety * 0.3 + 
         factors.timeOfDay * 0.2 + 
         factors.verificationStatus * 0.2 + 
         factors.emergencyContacts * 0.15 + 
         factors.recentActivity * 0.15)
    );
    
    const scoreElement = document.getElementById('safety-score');
    const scoreCircle = document.querySelector('.score-circle');
    
    if (scoreElement) {
        scoreElement.textContent = score;
    }
    
    if (scoreCircle) {
        // Update color based on score
        let gradient;
        if (score >= 80) {
            gradient = 'linear-gradient(135deg, #4CAF50, #45a049)';
        } else if (score >= 60) {
            gradient = 'linear-gradient(135deg, #ff9800, #f57c00)';
        } else {
            gradient = 'linear-gradient(135deg, #f44336, #d32f2f)';
        }
        scoreCircle.style.background = gradient;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    try {
        if (window.location.pathname === '/dashboard' || window.location.pathname.includes('dashboard')) {
            // Initialize all features when DOM is loaded - with safe function checks
            
            // Skip initializeDashboardTabs as it's not defined and not needed
            // if (typeof initializeDashboardTabs === "function") {
            //     initializeDashboardTabs();
            // }
            
            if (typeof initializeAlertHistory === "function") {
                initializeAlertHistory();
            }
            
            if (typeof initializeLiveTracking === "function") {
                initializeLiveTracking();
            }
            
            if (typeof initializeVolunteers === "function") {
                initializeVolunteers();
            }
            
            if (typeof initializeVoiceTextSOS === "function") {
                initializeVoiceTextSOS();
            }
            
            if (typeof initializeEFIR === "function") {
                initializeEFIR();
            }
            
            if (typeof updateSafetyScore === "function") {
                updateSafetyScore();
            }
            
            // Always try to initialize map - this is critical for Safety Map functionality
            setTimeout(() => {
                if (typeof L !== 'undefined' && typeof initializeMap === "function") {
                    initializeMap();
                } else {
                    console.warn('Leaflet library or initializeMap function not available');
                }
            }, 1000);
            
            // Initialize dashboard with event listeners
            if (typeof initializeDashboard === "function") {
                initializeDashboard();
            }
            
            // Initialize volunteer support button
            document.getElementById('request-volunteer-btn')?.addEventListener('click', requestVolunteerSupport);
        }
        
        // Document upload form event listener
        const documentForm = document.getElementById('documentForm');
        if (documentForm) {
            documentForm.addEventListener('submit', handleDocumentUpload);
        }
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        showAlert('Failed to initialize dashboard. Please refresh the page.', 'error');
    }
});
