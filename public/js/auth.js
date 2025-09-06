// Authentication JavaScript for Tourist Safety System

// Registration form handler
document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegistration);
    }

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

async function handleRegistration(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        userType: formData.get('userType'),
        password: formData.get('password'),
        confirmPassword: formData.get('confirmPassword')
    };

    // Validation
    if (!data.name || !data.email || !data.phone || !data.userType || !data.password) {
        showAlert('All fields are required', 'danger');
        return;
    }

    if (data.password !== data.confirmPassword) {
        showAlert('Passwords do not match', 'danger');
        return;
    }

    if (data.password.length < 6) {
        showAlert('Password must be at least 6 characters long', 'danger');
        return;
    }

    // Phone validation for Indian numbers
    if (data.userType === 'indian') {
        const phoneRegex = /^[6-9]\d{9}$/;
        if (!phoneRegex.test(data.phone)) {
            showAlert('Please enter a valid 10-digit Indian mobile number', 'danger');
            return;
        }
    }

    const registerBtn = document.getElementById('registerBtn');
    const originalText = registerBtn.innerHTML;
    registerBtn.innerHTML = '<div class="spinner"></div> Registering...';
    registerBtn.disabled = true;

    try {
        const response = await apiCall('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (response.success) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
            
            showAlert('Registration successful! Redirecting to dashboard...', 'success');
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 2000);
        }
    } catch (error) {
        showAlert(error.message || 'Registration failed', 'danger');
    } finally {
        registerBtn.innerHTML = originalText;
        registerBtn.disabled = false;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        email: formData.get('email'),
        password: formData.get('password')
    };

    if (!data.email || !data.password) {
        showAlert('Email and password are required', 'danger');
        return;
    }

    const loginBtn = document.getElementById('loginBtn');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<div class="spinner"></div> Logging in...';
    loginBtn.disabled = true;

    try {
        const response = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (response.success) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
            
            showAlert('Login successful! Redirecting to dashboard...', 'success');
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 2000);
        }
    } catch (error) {
        // Display specific error messages from backend
        let errorMessage = 'Login failed';
        
        // Check for specific backend error messages
        if (error.message === 'User not registered') {
            errorMessage = 'User not registered. Please check your email or register first.';
        } else if (error.message === 'Invalid credentials') {
            errorMessage = 'Invalid credentials. Please check your password.';
        } else if (error.message === 'Email and password are required') {
            errorMessage = 'Please enter both email and password.';
        } else if (error.message) {
            errorMessage = error.message;
        } else if (error.response && error.response.message) {
            errorMessage = error.response.message;
        }
        
        showAlert(errorMessage, 'danger');
    } finally {
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

// Phone number formatting
document.addEventListener('DOMContentLoaded', function() {
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 10) {
                value = value.substring(0, 10);
            }
            e.target.value = value;
        });
    }
});
