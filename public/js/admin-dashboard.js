// Admin Dashboard JavaScript
class AdminDashboard {
    constructor() {
        this.token = localStorage.getItem('adminToken');
        this.adminData = JSON.parse(localStorage.getItem('adminData') || '{}');
        this.currentSection = 'dashboard';
        this.refreshInterval = null;
        
        this.init();
    }

    init() {
        // Check authentication - JWT token must exist
        if (!this.token) {
            this.redirectToLogin();
            return;
        }

        // Validate token by making a test API call
        this.validateToken();
    }

    redirectToLogin() {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminData');
        window.location.href = '/admin-login.html';
    }

    async validateToken() {
        try {
            const response = await this.apiCall('/api/admin/stats');
            if (response) {
                // Token is valid, initialize dashboard
                this.setupEventListeners();
                this.displayAdminInfo();
                this.loadDashboardData();
                this.startAutoRefresh();
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            this.redirectToLogin();
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.switchSection(section);
            });
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Filters
        document.getElementById('sosStatusFilter')?.addEventListener('change', () => this.loadSOSAlerts());
        document.getElementById('sosDateFilter')?.addEventListener('change', () => this.loadSOSAlerts());
        document.getElementById('docStatusFilter')?.addEventListener('change', () => this.loadDocuments());
        document.getElementById('docTypeFilter')?.addEventListener('change', () => this.loadDocuments());
        document.getElementById('userSearchFilter')?.addEventListener('input', () => this.loadUsers());
        document.getElementById('userTypeFilter')?.addEventListener('change', () => this.loadUsers());

        // Modal close
        document.getElementById('closeSosModal')?.addEventListener('click', () => {
            document.getElementById('sosModal').style.display = 'none';
        });
        document.getElementById('closeDocModal')?.addEventListener('click', () => {
            document.getElementById('docModal').style.display = 'none';
        });

        // Close modal on outside click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
    }

    displayAdminInfo() {
        const adminInfo = document.getElementById('adminInfo');
        if (adminInfo) {
            adminInfo.innerHTML = `
                <div><strong>${this.adminData.username}</strong></div>
                <div>${this.adminData.role || 'Administrator'}</div>
            `;
        }
    }

    switchSection(section) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById(section).classList.add('active');

        // Update header
        const titles = {
            dashboard: 'Dashboard',
            sos: 'SOS Alerts',
            documents: 'Documents',
            users: 'Users',
            settings: 'Settings'
        };
        
        document.getElementById('pageTitle').textContent = titles[section];
        document.getElementById('breadcrumb').textContent = `Home / ${titles[section]}`;

        this.currentSection = section;

        // Load section data
        switch (section) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'sos':
                this.loadSOSAlerts();
                break;
            case 'documents':
                this.loadDocuments();
                break;
            case 'users':
                this.loadUsers();
                break;
        }
    }

    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(endpoint, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    ...options.headers
                }
            });

            if (response.status === 401) {
                this.showAlert('Session expired. Please login again.', 'error');
                this.redirectToLogin();
                return null;
            }

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            this.showAlert(error.message || 'Network error occurred', 'error');
            return null;
        }
    }

    showAlert(message, type) {
        const alert = document.getElementById('alert');
        alert.textContent = message;
        alert.className = `alert ${type}`;
        alert.style.display = 'block';

        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }

    async loadDashboardData() {
        try {
            const stats = await this.apiCall('/api/admin/stats');
            if (stats) {
                document.getElementById('activeSOS').textContent = stats.activeSOS || 0;
                document.getElementById('pendingDocs').textContent = stats.pendingDocs || 0;
                document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
                document.getElementById('verifiedUsers').textContent = stats.verifiedUsers || 0;
            }

            const activity = await this.apiCall('/api/admin/recent-activity');
            if (activity) {
                this.displayRecentActivity(activity.activities || []);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    displayRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        
        if (activities.length === 0) {
            container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No recent activity</div>';
            return;
        }

        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>User</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    ${activities.map(activity => `
                        <tr>
                            <td>${new Date(activity.timestamp).toLocaleString()}</td>
                            <td><span class="status-badge ${activity.type}">${activity.type}</span></td>
                            <td>${activity.user || 'System'}</td>
                            <td>${activity.description}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
    }

    async loadSOSAlerts() {
        const container = document.getElementById('sosContent');
        container.innerHTML = '<div class="loading"><div class="spinner"></div><div>Loading SOS alerts...</div></div>';

        const statusFilter = document.getElementById('sosStatusFilter')?.value || '';
        const dateFilter = document.getElementById('sosDateFilter')?.value || '';

        const params = new URLSearchParams();
        if (statusFilter) params.append('status', statusFilter);
        if (dateFilter) params.append('date', dateFilter);

        const alerts = await this.apiCall(`/api/admin/sos-alerts?${params}`);
        
        if (alerts && alerts.alerts) {
            this.displaySOSAlerts(alerts.alerts);
        }
    }

    displaySOSAlerts(alerts) {
        const container = document.getElementById('sosContent');
        
        if (alerts.length === 0) {
            container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No SOS alerts found</div>';
            return;
        }

        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>User</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${alerts.map(alert => `
                        <tr>
                            <td>${new Date(alert.timestamp).toLocaleString()}</td>
                            <td>${alert.user?.name || 'Unknown'}</td>
                            <td>${alert.location?.address || 'Location unavailable'}</td>
                            <td><span class="status-badge ${alert.status}">${alert.status}</span></td>
                            <td>
                                <button class="action-btn primary view-sos-btn" data-alert-id="${alert._id}">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                ${alert.status === 'active' ? `
                                    <button class="action-btn success resolve-sos-btn" data-alert-id="${alert._id}">
                                        <i class="fas fa-check"></i> Resolve
                                    </button>
                                ` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        
        // Call event listener attachment methods after rendering
        setTimeout(() => {
            this.attachSOSEventListeners();
            this.attachDocumentEventListeners();
        }, 100);
    }

    async displayRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        
        if (!container) {
            console.error('Recent activity container not found in DOM');
            return;
        }
        
        if (!activities || activities.length === 0) {
            container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No recent activity</div>';
            return;
        }

        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>User</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    ${activities.map(activity => `
                        <tr>
                            <td>${new Date(activity.timestamp).toLocaleString()}</td>
                            <td><span class="status-badge ${activity.type}">${activity.type}</span></td>
                            <td>${activity.user || 'System'}</td>
                            <td>${activity.description}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
            
        container.innerHTML = html;
    }

    async loadSOSAlerts() {
        const container = document.getElementById('sosContent');
        container.innerHTML = '<div class="loading"><div class="spinner"></div><div>Loading SOS alerts...</div></div>';

        const statusFilter = document.getElementById('sosStatusFilter')?.value || '';
        const dateFilter = document.getElementById('sosDateFilter')?.value || '';

        const params = new URLSearchParams();
        if (statusFilter) params.append('status', statusFilter);
        if (dateFilter) params.append('date', dateFilter);

        const alerts = await this.apiCall(`/api/admin/sos-alerts?${params}`);
            
        if (alerts && alerts.alerts) {
            this.displaySOSAlerts(alerts.alerts);
        }
    }

    displaySOSAlerts(alerts) {
        const container = document.getElementById('sosContent');
        
        if (!container) {
            console.error('SOS alerts container not found in DOM');
            return;
        }
            
        if (!alerts || alerts.length === 0) {
            container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No SOS alerts found</div>';
            return;
        }

        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>User</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${alerts.map(alert => `
                        <tr>
                            <td>${new Date(alert.timestamp).toLocaleString()}</td>
                            <td>${alert.user?.name || 'Unknown'}</td>
                            <td>${alert.location?.address || 'Location unavailable'}</td>
                            <td><span class="status-badge ${alert.status}">${alert.status}</span></td>
                            <td>
                                <button class="action-btn primary view-sos-btn" data-alert-id="${alert._id}">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                ${alert.status === 'active' ? `
                                    <button class="action-btn success resolve-sos-btn" data-alert-id="${alert._id}">
                                        <i class="fas fa-check"></i> Resolve
                                    </button>
                                ` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
            
        container.innerHTML = html;
            
        // Call event listener attachment methods after rendering
        setTimeout(() => {
            this.attachSOSEventListeners();
        }, 100);
    }

    async loadDocuments() {
        const container = document.getElementById('documentsContent');
        container.innerHTML = '<div class="loading"><div class="spinner"></div><div>Loading documents...</div></div>';

        const statusFilter = document.getElementById('docStatusFilter')?.value || '';
        const typeFilter = document.getElementById('docTypeFilter')?.value || '';

        const params = new URLSearchParams();
        if (statusFilter) params.append('status', statusFilter);
        if (typeFilter) params.append('type', typeFilter);

        const documents = await this.apiCall(`/api/admin/documents?${params}`);
        
        if (documents && documents.documents) {
            this.displayDocuments(documents.documents);
        }
    }

    displayDocuments(documents) {
        const container = document.getElementById('documentsContent');
        
        if (!container) {
            console.error('Documents container not found in DOM');
            return;
        }
        
        if (!documents || documents.length === 0) {
            container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No documents found</div>';
            return;
        }

        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Type</th>
                        <th>Uploaded</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${documents.map(doc => `
                        <tr>
                            <td>${doc.user?.name || 'Unknown'}</td>
                            <td>${doc.documentType}</td>
                            <td>${new Date(doc.uploadedAt).toLocaleString()}</td>
                            <td><span class="status-badge ${doc.verificationStatus}">${doc.verificationStatus}</span></td>
                            <td>
                                <button class="action-btn primary view-doc-btn" data-doc-id="${doc._id}">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                ${doc.verificationStatus === 'pending' ? `
                                    <button class="action-btn success approve-doc-btn" data-doc-id="${doc._id}">
                                        <i class="fas fa-check"></i> Approve
                                    </button>
                                    <button class="action-btn danger reject-doc-btn" data-doc-id="${doc._id}">
                                        <i class="fas fa-times"></i> Reject
                                    </button>
                                ` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        
        // Add event listeners for document action buttons
        this.attachDocumentEventListeners();
    }

    async loadUsers() {
        const container = document.getElementById('usersContent');
        container.innerHTML = '<div class="loading"><div class="spinner"></div><div>Loading users...</div></div>';

        const searchFilter = document.getElementById('userSearchFilter')?.value || '';
        const typeFilter = document.getElementById('userTypeFilter')?.value || '';

        const params = new URLSearchParams();
        if (searchFilter) params.append('search', searchFilter);
        if (typeFilter) params.append('type', typeFilter);

        const users = await this.apiCall(`/api/admin/users?${params}`);
        
        if (users && users.users) {
            this.displayUsers(users.users);
        }
    }

    displayUsers(users) {
        const container = document.getElementById('usersContent');
        
        if (!container) {
            console.error('Users container not found in DOM');
            return;
        }
        
        if (!users || users.length === 0) {
            container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No users found</div>';
            return;
        }

        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Type</th>
                        <th>Phone Verified</th>
                        <th>Document Verified</th>
                        <th>Registered</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td>${user.name}</td>
                            <td>${user.email}</td>
                            <td>${user.userType}</td>
                            <td><span class="status-badge ${user.phoneVerified ? 'approved' : 'pending'}">${user.phoneVerified ? 'Yes' : 'No'}</span></td>
                            <td><span class="status-badge ${user.documentVerified ? 'approved' : 'pending'}">${user.documentVerified ? 'Yes' : 'No'}</span></td>
                            <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
    }

    // Add event listeners for SOS action buttons
    attachSOSEventListeners() {
        // View SOS details buttons
        document.querySelectorAll('.view-sos-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const alertId = e.currentTarget.dataset.alertId;
                this.viewSOSDetails(alertId);
            });
        });

        // Resolve SOS alert buttons
        document.querySelectorAll('.resolve-sos-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const alertId = e.currentTarget.dataset.alertId;
                this.resolveSOSAlert(alertId);
            });
        });
    }

    // Add event listeners for document action buttons
    attachDocumentEventListeners() {
        // View document details buttons
        document.querySelectorAll('.view-doc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.dataset.docId;
                this.viewDocumentDetails(docId);
            });
        });

        // Approve document buttons
        document.querySelectorAll('.approve-doc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.dataset.docId;
                this.approveDocument(docId);
            });
        });

        // Reject document buttons
        document.querySelectorAll('.reject-doc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.dataset.docId;
                this.rejectDocument(docId);
            });
        });
    }

    async viewSOSDetails(alertId) {
        const alert = await this.apiCall(`/api/admin/sos-alerts/${alertId}`);
        if (alert) {
            const modal = document.getElementById('sosModal');
            const content = document.getElementById('sosModalContent');
            
            content.innerHTML = `
                <div style="margin-bottom: 1rem;">
                    <strong>User:</strong> ${alert.user?.name || 'Unknown'}<br>
                    <strong>Phone:</strong> ${alert.user?.phone || 'N/A'}<br>
                    <strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}<br>
                    <strong>Status:</strong> <span class="status-badge ${alert.status}">${alert.status}</span>
                </div>
                <div style="margin-bottom: 1rem;">
                    <strong>Location:</strong><br>
                    ${alert.location?.address || 'Address not available'}<br>
                    <small>Lat: ${alert.location?.latitude || 'N/A'}, Lng: ${alert.location?.longitude || 'N/A'}</small>
                </div>
                ${alert.message ? `<div style="margin-bottom: 1rem;"><strong>Message:</strong><br>${alert.message}</div>` : ''}
                <div>
                    <strong>Emergency Contacts Notified:</strong><br>
                    ${alert.contactsNotified?.map(contact => `${contact.name}: ${contact.phone}`).join('<br>') || 'None'}
                </div>
            `;
            
            modal.style.display = 'block';
        }
    }

    async viewDocumentDetails(docId) {
        const doc = await this.apiCall(`/api/admin/documents/${docId}`);
        if (doc) {
            const modal = document.getElementById('docModal');
            const content = document.getElementById('docModalContent');
            
            content.innerHTML = `
                <div style="margin-bottom: 1rem;">
                    <strong>User:</strong> ${doc.user?.name || 'Unknown'}<br>
                    <strong>Email:</strong> ${doc.user?.email || 'N/A'}<br>
                    <strong>Document Type:</strong> ${doc.documentType}<br>
                    <strong>Status:</strong> <span class="status-badge ${doc.verificationStatus}">${doc.verificationStatus}</span>
                </div>
                <div style="margin-bottom: 1rem;">
                    <strong>Uploaded:</strong> ${new Date(doc.uploadedAt).toLocaleString()}<br>
                    ${doc.verifiedAt ? `<strong>Verified:</strong> ${new Date(doc.verifiedAt).toLocaleString()}<br>` : ''}
                    ${doc.verifiedBy ? `<strong>Verified By:</strong> ${doc.verifiedBy}<br>` : ''}
                </div>
                <div style="margin-bottom: 1rem;">
                    <strong>Extracted Text:</strong><br>
                    <div style="background: #f8f9fa; padding: 1rem; border-radius: 5px; max-height: 200px; overflow-y: auto;">
                        ${doc.extractedText || 'No text extracted'}
                    </div>
                </div>
                <div>
                    <strong>Document File:</strong><br>
                    <div id="documentViewer-${docId}" style="border: 1px solid #ddd; border-radius: 5px; min-height: 300px; background: #f8f9fa;">
                        <div style="padding: 1rem; text-align: center;">Loading document...</div>
                    </div>
                </div>
            `;
            
            modal.style.display = 'block';
            
            // Load and display the document file properly
            this.loadDocumentFile(docId, doc.filePath, doc.fileName);
        }
    }

    async loadDocumentFile(docId, filePath, fileName) {
        const viewerContainer = document.getElementById(`documentViewer-${docId}`);
        if (!viewerContainer) return;

        try {
            // Get file extension to determine type
            const fileExtension = fileName.split('.').pop().toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(fileExtension);
            const isPDF = fileExtension === 'pdf';

            if (isImage) {
                // Display image with CSP-compliant error handling
                const img = document.createElement('img');
                // Ensure correct path - filePath should already be cleaned by backend
                img.src = filePath.startsWith('/') ? filePath : `/${filePath}`;
                img.alt = 'Document';
                img.style.cssText = 'max-width: 100%; height: auto; display: block; margin: 0 auto;';
                
                img.addEventListener('load', () => {
                    img.style.background = 'transparent';
                });
                
                img.addEventListener('error', () => {
                    // Show placeholder image or error message
                    viewerContainer.innerHTML = `
                        <div style="padding: 2rem; text-align: center; color: #e74c3c;">
                            <i class="fas fa-image" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                            <p>Image could not be loaded</p>
                            <small>File: ${fileName}</small>
                        </div>
                    `;
                });
                
                viewerContainer.innerHTML = '';
                viewerContainer.appendChild(img);
                
            } else if (isPDF) {
                // Display PDF using iframe with corrected path
                const pdfPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
                viewerContainer.innerHTML = `
                    <iframe src="${pdfPath}" 
                            style="width: 100%; height: 500px; border: none;"
                            title="PDF Document">
                        <p>Your browser does not support PDFs. 
                           <a href="${pdfPath}" target="_blank">Download the PDF</a>
                        </p>
                    </iframe>
                `;
            } else {
                // Unsupported file type - show download link with corrected path
                const downloadPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
                viewerContainer.innerHTML = `
                    <div style="padding: 2rem; text-align: center;">
                        <i class="fas fa-file" style="font-size: 3rem; color: #7f8c8d; margin-bottom: 1rem;"></i>
                        <p>File type not supported for preview</p>
                        <a href="${downloadPath}" target="_blank" class="action-btn primary">
                            <i class="fas fa-download"></i> Download File
                        </a>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading document file:', error);
            viewerContainer.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Error loading document
                </div>
            `;
        }
    }

    async resolveSOSAlert(alertId) {
        if (confirm('Are you sure you want to mark this SOS alert as resolved?')) {
            const result = await this.apiCall(`/api/admin/sos-alerts/${alertId}/resolve`, {
                method: 'PUT'
            });
            
            if (result) {
                this.showAlert('SOS alert marked as resolved', 'success');
                this.loadSOSAlerts();
                this.loadDashboardData(); // Refresh stats
            }
        }
    }

    async approveDocument(docId) {
        if (confirm('Are you sure you want to approve this document?')) {
            const result = await this.apiCall(`/api/admin/documents/${docId}/approve`, {
                method: 'PUT'
            });
            
            if (result) {
                this.showAlert('Document approved successfully', 'success');
                this.loadDocuments();
                this.loadDashboardData(); // Refresh stats
            }
        }
    }

    async rejectDocument(docId) {
        const reason = prompt('Please provide a reason for rejection:');
        if (reason) {
            const result = await this.apiCall(`/api/admin/documents/${docId}/reject`, {
                method: 'PUT',
                body: JSON.stringify({ reason })
            });
            
            if (result) {
                this.showAlert('Document rejected', 'success');
                this.loadDocuments();
                this.loadDashboardData(); // Refresh stats
            }
        }
    }

    startAutoRefresh() {
        // Refresh dashboard data every 30 seconds
        this.refreshInterval = setInterval(() => {
            if (this.currentSection === 'dashboard') {
                this.loadDashboardData();
            }
        }, 30000);
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminData');
            
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            
            window.location.href = '/admin-login';
        }
    }
}

// Initialize dashboard when page loads
let adminDashboard;
document.addEventListener('DOMContentLoaded', () => {
    adminDashboard = new AdminDashboard();
});
