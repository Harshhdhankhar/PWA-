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

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatPhone(phone) {
    // Format Indian phone numbers
    if (phone.startsWith('+91')) {
        return phone;
    } else if (phone.startsWith('91') && phone.length === 12) {
        return '+' + phone;
    } else if (phone.length === 10) {
        return '+91' + phone;
    }
    return phone;
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

// Modal functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
}

// Loading spinner
function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<div class="spinner"></div>';
    }
}

function hideLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '';
    }
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

// CSS for modals (add to styles.css)
const modalStyles = `
.modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: white;
    border-radius: 15px;
    padding: 0;
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #e9ecef;
}

.modal-header h4 {
    margin: 0;
    color: #333;
}

.close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.close-btn:hover {
    color: #333;
}

.modal-body {
    padding: 20px;
}

.modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
}

.tab-btn {
    background: #f8f9fa;
    border: none;
    padding: 15px 20px;
    border-radius: 10px 10px 0 0;
    cursor: pointer;
    font-weight: 600;
    color: #666;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
}

.tab-btn.active {
    background: white;
    color: #667eea;
    border-bottom: 2px solid #667eea;
}

.tab-btn:hover {
    background: #e9ecef;
}

.tab-content {
    background: white;
    padding: 20px;
    border-radius: 0 0 15px 15px;
}

.admin-tabs {
    display: flex;
    gap: 5px;
    margin-bottom: 0;
}

.filters {
    display: flex;
    gap: 10px;
    align-items: center;
}

.filters select {
    padding: 8px 12px;
    border: 1px solid #e9ecef;
    border-radius: 5px;
    font-size: 0.9rem;
}
`;

// Add modal styles to head
const mainStyleSheet = document.createElement('style');
mainStyleSheet.textContent = modalStyles;
document.head.appendChild(mainStyleSheet);
