// Main JavaScript file for Tourist Safety System

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

// API helper functions
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
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
        const data = await response.json();
        
        if (!response.ok) {
            // Create error object with response data for better error handling
            const error = new Error(data.message || 'Request failed');
            error.status = response.status;
            error.response = data;
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('API call error:', error);
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
    localStorage.removeItem('isAdmin'); // Remove admin flag
    window.location.href = '/';
}

function redirectIfNotAuthenticated() {
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

// Geolocation helper
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
                    longitude: position.coords.longitude
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is on a protected page
    const protectedPages = ['/dashboard'];
    const currentPath = window.location.pathname;
    
    // Handle dashboard authentication
    if (protectedPages.includes(currentPath)) {
        if (!redirectIfNotAuthenticated()) {
            return;
        }
    }
    
    // Admin page has its own authentication handling in admin.js
    // Don't redirect admin page to login

    // Initialize page-specific functionality
    if (currentPath === '/dashboard') {
        initializeDashboard();
    }
    // Admin initialization is handled in admin.js
});
