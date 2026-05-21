// Settings Page JavaScript
const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadSettings();
    loadStats();
    loadAvailableModels();
});

function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const sessionStr = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (sessionStr) {
        try {
            const sessionData = JSON.parse(sessionStr);
            if (sessionData.token) {
                headers['Authorization'] = `Bearer ${sessionData.token}`;
            }
        } catch (e) {
            // 兼容直接存储token的情况
            if (sessionStr && sessionStr.length > 10) {
                headers['Authorization'] = `Bearer ${sessionStr}`;
            }
        }
    }
    return headers;
}

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
        // 首先尝试从服务器获取用户配置
        const resp = await fetch(`${API_BASE}/auth/config`, {
            headers: getAuthHeaders()
        });

        if (resp.ok) {
            const cfg = await resp.json();
            if (cfg.api_base_url) {
                document.getElementById('api-url').value = cfg.api_base_url;
            }
            if (cfg.theme) {
                document.getElementById('theme-select').value = cfg.theme;
            }
            if (cfg.model) {
                const modelSelect = document.getElementById('model-select');
                if (modelSelect) {
                    modelSelect.value = cfg.model;
                }
            }
            // API Key - 如果服务器有保存的，显示部分遮罩
            if (cfg.api_key) {
                document.getElementById('api-key').value = cfg.api_key;
            }
        }
    } catch {}

    // 同时检查 localStorage 的配置作为补充
    const savedModel = localStorage.getItem('agent_model');
    if (savedModel) {
        const modelSelect = document.getElementById('model-select');
        if (modelSelect && !modelSelect.value) {
            modelSelect.value = savedModel;
        }
    }

    const savedApiUrl = localStorage.getItem('agent_api_url');
    if (savedApiUrl) {
        const apiUrlInput = document.getElementById('api-url');
        if (apiUrlInput && !apiUrlInput.value) {
            apiUrlInput.value = savedApiUrl;
        }
    }

    const savedApiKey = localStorage.getItem('agent_api_key');
    if (savedApiKey) {
        const apiKeyInput = document.getElementById('api-key');
        if (apiKeyInput && !apiKeyInput.value) {
            apiKeyInput.value = savedApiKey;
        }
    }

    // Username
    const username = localStorage.getItem('agent_username') || sessionStorage.getItem('agent_username');
    const usernameInput = document.getElementById('username');
    if (usernameInput) usernameInput.value = username || '';

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
            if (sel && data.models && data.models.length > 0) {
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

    // 保存到 localStorage
    localStorage.setItem('agent_model', model);
    localStorage.setItem('agent_theme', theme);
    localStorage.setItem('agent_sidebar_width', sidebarWidth);
    localStorage.setItem('agent_api_url', apiUrl);
    if (username) localStorage.setItem('agent_username', username);
    if (apiKey) localStorage.setItem('agent_api_key', apiKey);

    // 保存 GitHub 设置到 localStorage
    const ghToken = document.getElementById('gh-token')?.value?.trim();
    const ghRepo = document.getElementById('gh-repo')?.value?.trim();
    const ghBranch = document.getElementById('gh-branch')?.value?.trim() || 'main';
    const ghAutoSync = document.getElementById('gh-auto-sync')?.checked;
    localStorage.setItem('gh_token', ghToken);
    localStorage.setItem('gh_repo', ghRepo);
    localStorage.setItem('gh_branch', ghBranch);
    localStorage.setItem('gh_auto_sync', ghAutoSync ? 'true' : 'false');

    // 保存 API 配置到服务器（用户级别）
    let serverSaveSuccess = false;
    if (apiKey || apiUrl || model) {
        try {
            const res = await fetch(`${API_BASE}/auth/config`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    api_key: apiKey || undefined,
                    api_base_url: apiUrl || undefined,
                    model: model || undefined,
                    temperature: 0.7,
                    max_tokens: 4096,
                    theme: theme || undefined,
                })
            });

            if (res.ok) {
                serverSaveSuccess = true;
                showToast('Settings saved to server and browser');
            } else if (res.status === 401) {
                // 未登录，只保存到本地
                showToast('Settings saved locally (please login to sync)', 'warning');
            } else {
                const err = await res.json().catch(() => ({}));
                showToast('Settings saved locally — server error: ' + (err.detail || res.status), 'error');
            }
        } catch (err) {
            showToast('Settings saved locally (server unreachable)', 'warning');
        }
    } else {
        showToast('Settings saved', 'success');
    }

    // 应用主题和侧边栏宽度
    applyTheme(theme);
    applySidebarWidth(sidebarWidth);
}

function applyTheme(theme) {
    // 可以切换 data-theme 属性用于 CSS
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
    localStorage.removeItem('agent_api_key');
    document.getElementById('api-url').value = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    document.getElementById('model-select').value = 'qwen3-max';
    document.getElementById('theme-select').value = 'light';
    document.getElementById('sidebar-width').value = '260';
    document.getElementById('api-key').value = '';
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
    t.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : type === 'warning' ? 'triangle-exclamation' : 'xmark'}"></i>${msg}`;
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
