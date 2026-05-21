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

function validateUsername(username) {
    if (!username) return 'Username is required';
    if (username.length < 2 || username.length > 20) return 'Username must be 2-20 characters';
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return 'Username can only contain letters, numbers, _ and -';
    return null;
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;
    const loginBtn = document.getElementById('login-btn');
    const errorDiv = document.getElementById('login-error');
    const errorMessage = document.getElementById('error-message');

    errorDiv.classList.add('hidden');

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    const usernameError = validateUsername(username);
    if (usernameError) {
        showError(usernameError);
        return;
    }

    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Login failed');
        }

        const data = await response.json();

        localStorage.setItem('agent_username', data.username);

        const sessionData = {
            id: data.id,
            username: data.username,
            token: data.token,
            loginTime: new Date().toISOString(),
            remember: remember
        };

        if (remember) {
            localStorage.setItem('agent_session', JSON.stringify(sessionData));
        } else {
            sessionStorage.setItem('agent_session', JSON.stringify(sessionData));
        }

        window.navigateTo('/dashboard');

    } catch (error) {
        showError(error.message || 'Login failed. Please try again.');
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const registerBtn = document.getElementById('register-btn');
    const errorDiv = document.getElementById('register-error');
    const errorMessage = document.getElementById('register-error-message');

    errorDiv.classList.add('hidden');

    if (!username || !password) {
        errorMessage.textContent = 'Please fill in all fields';
        errorDiv.classList.remove('hidden');
        return;
    }

    const usernameError = validateUsername(username);
    if (usernameError) {
        errorMessage.textContent = usernameError;
        errorDiv.classList.remove('hidden');
        return;
    }

    if (password !== confirmPassword) {
        errorMessage.textContent = 'Passwords do not match';
        errorDiv.classList.remove('hidden');
        return;
    }

    if (password.length < 6) {
        errorMessage.textContent = 'Password must be at least 6 characters';
        errorDiv.classList.remove('hidden');
        return;
    }

    registerBtn.classList.add('loading');
    registerBtn.disabled = true;

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Registration failed');
        }

        const data = await response.json();

        localStorage.setItem('agent_username', data.username);

        const sessionData = {
            id: data.id,
            username: data.username,
            token: data.token,
            loginTime: new Date().toISOString(),
            remember: true
        };

        localStorage.setItem('agent_session', JSON.stringify(sessionData));

        window.navigateTo('/dashboard');

    } catch (error) {
        errorMessage.textContent = error.message || 'Registration failed. Please try again.';
        errorDiv.classList.remove('hidden');
        registerBtn.classList.remove('loading');
        registerBtn.disabled = false;
    }
}

function showError(message) {
    const errorDiv = document.getElementById('login-error');
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (session) {
        try {
            const sessionData = JSON.parse(session);
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${sessionData.token}`
                }
            });

            if (response.ok) {
                window.navigateTo('/dashboard');
            } else {
                localStorage.removeItem('agent_session');
                sessionStorage.removeItem('agent_session');
            }
        } catch (e) {
            localStorage.removeItem('agent_session');
            sessionStorage.removeItem('agent_session');
        }
    }
});

document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin(e);
        }
    });
});

let isRegisterMode = false;

function toggleRegisterMode() {
    isRegisterMode = !isRegisterMode;
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toggleText = document.getElementById('toggle-mode-text');
    const toggleLink = document.getElementById('toggle-mode-link');

    if (isRegisterMode) {
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'block';
        if (toggleText) toggleText.textContent = 'Already have an account?';
        if (toggleLink) toggleLink.textContent = 'Sign in';
    } else {
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
        if (toggleText) toggleText.textContent = "Don't have an account?";
        if (toggleLink) toggleLink.textContent = 'Sign up';
    }
}
