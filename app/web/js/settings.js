// Settings Page JavaScript
const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadSettings();
    loadStats();
    loadAvailableModels();
});

function checkAuth() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (!session) window.navigateTo('/login');
    const username = localStorage.getItem('agent_username') || sessionStorage.getItem('agent_username');
    if (username) {
        const el = document.getElementById('display-username');
        const inp = document.getElementById('username');
        if (el) el.textContent = username;
        if (inp) inp.value = username;
    }
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
            const usernameInput = document.getElementById('username');
            if (usernameInput) usernameInput.value = username;
            // API Key (from server-side config, then localStorage)
            const savedKey = localStorage.getItem('agent_api_key');
            if (cfg.api_key && cfg.api_key !== '***') {
                document.getElementById('api-key').value = cfg.api_key;
            } else if (savedKey) {
                document.getElementById('api-key').value = savedKey;
            }
        }
    } catch {}
    // GitHub settings
    document.getElementById('gh-token').value = localStorage.getItem('gh_token') || '';
    document.getElementById('gh-repo').value = localStorage.getItem('gh_repo') || '';
    document.getElementById('gh-branch').value = localStorage.getItem('gh_branch') || 'main';
    document.getElementById('gh-auto-sync').checked = localStorage.getItem('gh_auto_sync') === 'true';
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
    if (apiKey) localStorage.setItem('agent_api_key', apiKey);

    // Save GitHub settings to localStorage
    const ghToken = document.getElementById('gh-token')?.value?.trim();
    const ghRepo = document.getElementById('gh-repo')?.value?.trim();
    const ghBranch = document.getElementById('gh-branch')?.value?.trim() || 'main';
    const ghAutoSync = document.getElementById('gh-auto-sync')?.checked;
    localStorage.setItem('gh_token', ghToken);
    localStorage.setItem('gh_repo', ghRepo);
    localStorage.setItem('gh_branch', ghBranch);
    localStorage.setItem('gh_auto_sync', ghAutoSync ? 'true' : 'false');

    // Save API key to server-side config
    if (apiKey) {
        localStorage.setItem('agent_api_key', apiKey);
        let apiKeySaved = false;
        try {
            const res = await fetch(`${API_BASE}/config/api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey }),
            });
            if (res.ok) {
                apiKeySaved = true;
            } else {
                const err = await res.json().catch(() => ({}));
                showToast('API key (local) saved — server error: ' + (err.detail || res.status), 'error');
            }
        } catch (err) {
            showToast('API key (local) saved — server unreachable', 'error');
        }
        if (apiKeySaved) {
            showToast('API key saved successfully');
        }
    } else {
        showToast('Settings saved (API key unchanged)', 'success');
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
    window.navigateTo('/login');
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : 'xmark'}"></i>${msg}`;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

async function testGhConnection() {
    const token = document.getElementById('gh-token')?.value?.trim();
    const repo = document.getElementById('gh-repo')?.value?.trim();
    const statusEl = document.getElementById('gh-conn-status');
    if (!token || !repo) {
        statusEl.innerHTML = '<span style="color:#ef4444">Please fill in token and repository</span>';
        return;
    }
    statusEl.innerHTML = '<span style="color:#6b7280"><i class="fa-solid fa-spinner fa-spin"></i> Testing...</span>';
    try {
        const resp = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
        });
        if (resp.ok) {
            const data = await resp.json();
            statusEl.innerHTML = `<span style="color:#10b981"><i class="fa-solid fa-check-circle"></i> Connected — ${data.full_name}</span>`;
        } else if (resp.status === 401) {
            statusEl.innerHTML = '<span style="color:#ef4444"><i class="fa-solid fa-xmark-circle"></i> Invalid token</span>';
        } else if (resp.status === 404) {
            statusEl.innerHTML = '<span style="color:#f59e0b"><i class="fa-solid fa-xmark-circle"></i> Repository not found</span>';
        } else {
            statusEl.innerHTML = `<span style="color:#ef4444"><i class="fa-solid fa-xmark-circle"></i> Error ${resp.status}</span>`;
        }
    } catch {
        statusEl.innerHTML = '<span style="color:#ef4444"><i class="fa-solid fa-xmark-circle"></i> Network error</span>';
    }
}
