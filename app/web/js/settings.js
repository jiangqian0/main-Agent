// Settings Page JavaScript
const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSidebarResize();
    loadSettings();
    loadStats();
    loadAvailableModels();
});

function checkAuth() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (!session) window.location.href = '/login';
    const username = localStorage.getItem('agent_username') || sessionStorage.getItem('agent_username');
    if (username) {
        const el = document.getElementById('display-username');
        const inp = document.getElementById('username');
        if (el) el.textContent = username;
        if (inp) inp.value = username;
    }
}

function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('sidebar-resize-handle');
    let isDragging = false;
    handle && handle.addEventListener('mousedown', e => {
        isDragging = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        sidebar.style.width = Math.min(400, Math.max(200, e.clientX)) + 'px';
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}

async function loadSettings() {
    try {
        const resp = await fetch(`${API_BASE}/config`);
        if (resp.ok) {
            const cfg = await resp.json();
            document.getElementById('api-url').value = cfg.api_base_url || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
            document.getElementById('theme-select').value = cfg.theme || 'light';
            document.getElementById('sidebar-width').value = cfg.sidebar_width || '260';
            // Username
            const username = localStorage.getItem('agent_username') || cfg.username || 'User';
            document.getElementById('display-username').textContent = username;
            document.getElementById('username').value = username;
            // API Key (from server-side config, then localStorage)
            const savedKey = localStorage.getItem('agent_api_key');
            if (cfg.api_key && cfg.api_key !== '***') {
                document.getElementById('api-key').value = cfg.api_key;
            } else if (savedKey) {
                document.getElementById('api-key').value = savedKey;
            }
        }
    } catch {}
}

async function loadAvailableModels() {
    try {
        const resp = await fetch(`${API_BASE}/config/models`);
        if (resp.ok) {
            const data = await resp.json();
            const sel = document.getElementById('model-select');
            if (sel) {
                const current = localStorage.getItem('agent_model') || 'qwen3-max';
                sel.innerHTML = data.models.map(m =>
                    `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${m.name} (${m.provider})</option>`
                ).join('');
            }
        }
    } catch {}
}

function loadStats() {
    const conversations = JSON.parse(localStorage.getItem('agent_conversations') || '[]');
    const memories = JSON.parse(localStorage.getItem('agent_memories') || '[]');
    document.getElementById('conversation-count').textContent = conversations.length;
    document.getElementById('memory-count').textContent = memories.length;

    // Estimate storage
    const totalSize = (
        (localStorage.getItem('agent_conversations') || '').length +
        (localStorage.getItem('agent_conversations') || '').length +
        (localStorage.getItem('agent_settings') || '').length
    );
    document.getElementById('storage-used').textContent = formatBytes(totalSize);
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

async function saveSettings() {
    const model = document.getElementById('model-select')?.value;
    const theme = document.getElementById('theme-select')?.value;
    const sidebarWidth = parseInt(document.getElementById('sidebar-width')?.value) || 260;
    const username = document.getElementById('username')?.value?.trim();
    const apiUrl = document.getElementById('api-url')?.value?.trim();
    const apiKey = document.getElementById('api-key')?.value?.trim();

    localStorage.setItem('agent_model', model);
    localStorage.setItem('agent_theme', theme);
    localStorage.setItem('agent_sidebar_width', sidebarWidth);
    localStorage.setItem('agent_api_url', apiUrl);
    if (username) localStorage.setItem('agent_username', username);
    // Save API key to localStorage
    if (apiKey) localStorage.setItem('agent_api_key', apiKey);

    // Save API key to server-side config
    if (apiKey) {
        localStorage.setItem('agent_api_key', apiKey);
        try {
            await fetch(`${API_BASE}/config/api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey }),
            });
        } catch {}
    }

    try {
        await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                theme,
                sidebar_width: sidebarWidth,
                username,
                api_base_url: apiUrl,
            })
        });
    } catch {}

    // Apply theme immediately
    applyTheme(theme);
    applySidebarWidth(sidebarWidth);
    document.getElementById('display-username').textContent = username || 'User';

    showToast('Settings saved');
}

function applyTheme(theme) {
    // Could toggle a data-theme attribute for CSS
}

function applySidebarWidth(w) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.width = w + 'px';
}

function resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;
    localStorage.removeItem('agent_model');
    localStorage.removeItem('agent_theme');
    localStorage.removeItem('agent_sidebar_width');
    localStorage.removeItem('agent_api_url');
    document.getElementById('api-url').value = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    document.getElementById('model-select').value = 'qwen3-max';
    document.getElementById('theme-select').value = 'light';
    document.getElementById('sidebar-width').value = '260';
    showToast('Settings reset');
}

function clearConversations() {
    if (!confirm('Delete all conversation history? This cannot be undone.')) return;
    localStorage.removeItem('agent_conversations');
    loadStats();
    showToast('History cleared');
}

function clearAllData() {
    if (!confirm('Clear ALL local data including memories and settings? This cannot be undone.')) return;
    localStorage.clear();
    sessionStorage.clear();
    loadStats();
    showToast('All data cleared');
}

function togglePassword() {
    const input = document.getElementById('api-key');
    const icon = document.getElementById('toggle-icon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-regular fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-regular fa-eye';
    }
}

function logout() {
    localStorage.removeItem('agent_session');
    sessionStorage.removeItem('agent_session');
    window.location.href = '/login';
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : 'xmark'}"></i>${msg}`;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
