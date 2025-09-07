// PWA Service Worker Registration and Installation
class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.init();
    }

    async init() {
        // Register service worker
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered successfully:', registration);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateAvailable();
                        }
                    });
                });
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }

        // Handle install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
        });

        // Handle app installed
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            this.hideInstallButton();
            this.showInstallSuccess();
        });

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            console.log('PWA is running in standalone mode');
        }
    }

    showInstallButton() {
        const installButton = document.getElementById('pwa-install-btn');
        if (installButton) {
            installButton.style.display = 'block';
            installButton.addEventListener('click', () => this.installApp());
        } else {
            // Create install button if it doesn't exist
            this.createInstallButton();
        }
    }

    createInstallButton() {
        const installBtn = document.createElement('button');
        installBtn.id = 'pwa-install-btn';
        installBtn.innerHTML = '<i class="fas fa-download"></i> Install App';
        installBtn.className = 'pwa-install-btn';
        installBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 25px;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            z-index: 1000;
            transition: all 0.3s ease;
        `;
        
        installBtn.addEventListener('mouseover', () => {
            installBtn.style.transform = 'translateY(-2px)';
            installBtn.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
        });
        
        installBtn.addEventListener('mouseout', () => {
            installBtn.style.transform = 'translateY(0)';
            installBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
        });

        installBtn.addEventListener('click', () => this.installApp());
        document.body.appendChild(installBtn);
    }

    hideInstallButton() {
        const installButton = document.getElementById('pwa-install-btn');
        if (installButton) {
            installButton.style.display = 'none';
        }
    }

    async installApp() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            
            this.deferredPrompt = null;
        }
    }

    showUpdateAvailable() {
        const updateBanner = document.createElement('div');
        updateBanner.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: #4CAF50;
                color: white;
                padding: 12px;
                text-align: center;
                z-index: 10000;
                font-size: 14px;
            ">
                <span>New version available!</span>
                <button onclick="window.location.reload()" style="
                    background: transparent;
                    border: 1px solid white;
                    color: white;
                    padding: 4px 12px;
                    margin-left: 10px;
                    border-radius: 4px;
                    cursor: pointer;
                ">Update</button>
                <button onclick="this.parentElement.remove()" style="
                    background: transparent;
                    border: none;
                    color: white;
                    padding: 4px 8px;
                    margin-left: 5px;
                    cursor: pointer;
                    font-size: 16px;
                ">&times;</button>
            </div>
        `;
        document.body.appendChild(updateBanner);
    }

    showInstallSuccess() {
        const successMessage = document.createElement('div');
        successMessage.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 16px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                animation: slideIn 0.3s ease;
            ">
                <i class="fas fa-check-circle"></i> App installed successfully!
            </div>
        `;
        
        document.body.appendChild(successMessage);
        
        setTimeout(() => {
            successMessage.remove();
        }, 3000);
    }

    // Offline SOS functionality
    async sendOfflineSOS(sosData) {
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
            try {
                // Store SOS request for background sync
                const cache = await caches.open('sos-requests');
                const request = new Request('/api/emergency/sos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sosData)
                });
                
                await cache.put(request.url, new Response(JSON.stringify(sosData)));
                
                // Register for background sync
                const registration = await navigator.serviceWorker.ready;
                await registration.sync.register('sos-sync');
                
                return { success: true, offline: true };
            } catch (error) {
                console.error('Failed to queue offline SOS:', error);
                return { success: false, error: error.message };
            }
        }
        
        return { success: false, error: 'Background sync not supported' };
    }
}

// Initialize PWA Manager
const pwaManager = new PWAManager();

// Export for use in other scripts
window.pwaManager = pwaManager;
