// Login Page JavaScript

function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('password-toggle-icon');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.className = 'fa-regular fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        toggleIcon.className = 'fa-regular fa-eye';
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;
    const loginBtn = document.getElementById('login-btn');
    const errorDiv = document.getElementById('login-error');
    const errorMessage = document.getElementById('error-message');

    // Hide any previous error
    errorDiv.classList.add('hidden');

    // Validate inputs
    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    // Show loading state
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    try {
        // Simulate login - in production, this would call an API
        // For demo purposes, accept any non-empty credentials
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Store session
        const sessionData = {
            username: username,
            loginTime: new Date().toISOString(),
            remember: remember
        };

        if (remember) {
            localStorage.setItem('agent_session', JSON.stringify(sessionData));
            localStorage.setItem('agent_username', username);
        } else {
            sessionStorage.setItem('agent_session', JSON.stringify(sessionData));
        }

        // Redirect to dashboard
        window.navigateTo('/dashboard');

    } catch (error) {
        showError('Login failed. Please try again.');
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
    }
}

function showError(message) {
    const errorDiv = document.getElementById('login-error');
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
}

// Check if already logged in
document.addEventListener('DOMContentLoaded', () => {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (session) {
        // Already logged in, redirect to dashboard
        window.navigateTo('/dashboard');
    }
});

// Handle enter key on inputs
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin(e);
        }
    });
});
