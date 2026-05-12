// Dashboard Page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSidebarResize();
    loadUserInfo();
    setGreeting();
    renderDashboard();
});

function checkAuth() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (!session) window.location.href = '/login';
}

function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('sidebar-resize-handle');
    let dragging = false;
    handle && handle.addEventListener('mousedown', e => {
        dragging = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        sidebar.style.width = Math.min(400, Math.max(200, e.clientX)) + 'px';
    });
    document.addEventListener('mouseup', () => {
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}

function loadUserInfo() {
    const name = localStorage.getItem('agent_username') || sessionStorage.getItem('agent_username') || 'User';
    const el = document.getElementById('sidebar-username');
    if (el) el.textContent = name;
}

function setGreeting() {
    const h = new Date().getHours();
    const g = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    document.title = 'Dashboard - Agent Hub';
}

function logout() {
    localStorage.removeItem('agent_session');
    sessionStorage.removeItem('agent_session');
    window.location.href = '/login';
}

async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    const name = localStorage.getItem('agent_username') || sessionStorage.getItem('agent_username') || 'User';
    const h = new Date().getHours();
    const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';

    let convCount = 0, skillCount = 0, fileCount = 0;
    const convs = JSON.parse(localStorage.getItem('agent_conversations') || '[]');
    convCount = convs.length;

    try {
        const skRes = await fetch('/api/skills');
        if (skRes.ok) {
            const data = await skRes.json();
            const skills = Array.isArray(data) ? data : (data.skills || []);
            skillCount = skills.filter(s => s.enabled).length;
        }
    } catch (_) {}

    try {
        const wsRes = await fetch('/api/workspace/files');
        if (wsRes.ok) {
            const files = await wsRes.json();
            fileCount = Array.isArray(files) ? files.length : 0;
        }
    } catch (_) {}

    container.innerHTML = `
        <div class="dashboard-content">
            <!-- Welcome -->
            <div class="dash-welcome" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;">
                <div>
                    <h1>Good ${greeting}, ${escHtml(name)}</h1>
                    <p>Here's an overview of your agent activity.</p>
                </div>
                <a href="/chat" class="dash-new-chat-btn">
                    <i class="fa-solid fa-plus"></i> New Chat
                </a>
            </div>

            <!-- Stats -->
            <div class="dash-stats-grid">
                <div class="dash-stat-card">
                    <div class="dash-stat-icon icon-green">
                        <i class="fa-solid fa-comment-dots" style="color:var(--primary);"></i>
                    </div>
                    <div>
                        <div class="dash-stat-value" data-target="${convCount}">${convCount}</div>
                        <div class="dash-stat-label">Conversations</div>
                    </div>
                </div>
                <div class="dash-stat-card">
                    <div class="dash-stat-icon icon-blue">
                        <i class="fa-solid fa-code" style="color:#002D62;"></i>
                    </div>
                    <div>
                        <div class="dash-stat-value" data-target="${skillCount}">${skillCount}</div>
                        <div class="dash-stat-label">Active Skills</div>
                    </div>
                </div>
                <div class="dash-stat-card">
                    <div class="dash-stat-icon icon-emerald">
                        <i class="fa-solid fa-folder-open" style="color:#10B981;"></i>
                    </div>
                    <div>
                        <div class="dash-stat-value" data-target="${fileCount}">${fileCount}</div>
                        <div class="dash-stat-label">Workspace Files</div>
                    </div>
                </div>
                <div class="dash-stat-card">
                    <div class="dash-stat-icon icon-amber">
                        <i class="fa-solid fa-puzzle-piece" style="color:#F59E0B;"></i>
                    </div>
                    <div>
                        <div class="dash-stat-value" data-target="6">6</div>
                        <div class="dash-stat-label">Built-in Tools</div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions + Recent -->
            <div class="dash-two-col">
                <div class="dash-section-card">
                    <div class="dash-section-title">
                        <i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Quick Actions
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${quickAction('/chat', 'fa-code', 'Code Development', 'Generate, review, and refactor code', 'var(--primary)')}
                        ${quickAction('/workspace', 'fa-folder-open', 'Browse Workspace', 'View and edit project files', '#10B981')}
                        ${quickAction('/skills', 'fa-puzzle-piece', 'Manage Skills', 'Customize agent capabilities', '#F59E0B')}
                        ${quickAction('/knowledge', 'fa-book-open', 'Knowledge Base', 'Manage reference documents', '#002D62')}
                        ${quickAction('/agents', 'fa-robot', 'Agent Center', 'Configure AI agents', '#7C3AED')}
                        ${quickAction('/deploy', 'fa-rocket', 'Deployment & Ops', 'Deploy and manage applications', '#DC2626')}
                    </div>
                </div>

                <div class="dash-section-card">
                    <div class="dash-section-title">
                        <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary);"></i> Recent Conversations
                    </div>
                    <div id="recent-list">
                        ${renderRecentConversations(convs)}
                    </div>
                </div>
            </div>

            <!-- System Status -->
            <div class="dash-section-card" style="animation-delay:0.1s;">
                <div class="dash-section-title">
                    <i class="fa-solid fa-circle-check" style="color:#10B981;"></i> System Status
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                    ${systemStatusItem('API Service', true)}
                    ${systemStatusItem('Skill Engine', true)}
                    ${systemStatusItem('Workspace Storage', true)}
                    ${systemStatusItem('Knowledge Base', true)}
                </div>
            </div>
        </div>
    `;

    // Trigger counter animation after cards appear
    setTimeout(animateCounters, 400);
}

function animateCounters() {
    document.querySelectorAll('.dash-stat-value[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target, 10);
        const duration = 800;
        const start = performance.now();
        const initial = 0;

        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(initial + (target - initial) * eased);
            el.textContent = current;
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    });
}

function quickAction(href, icon, title, desc, color) {
    return `<a href="${href}" class="dash-quick-action">
        <div class="dash-quick-action-icon" style="background:linear-gradient(135deg,${color}18 0%,${color}08 100%);">
            <i class="fa-solid ${icon}" style="color:${color};"></i>
        </div>
        <div class="dash-quick-action-info">
            <h3>${title}</h3>
            <p>${desc}</p>
        </div>
        <i class="fa-solid fa-arrow-right dash-quick-action-arrow"></i>
    </a>`;
}

function systemStatusItem(name, operational) {
    const color = operational ? '#10B981' : '#EF4444';
    const label = operational ? 'Operational' : 'Offline';
    const dotClass = operational ? 'online' : 'offline';
    const labelClass = operational ? 'online' : 'offline';
    return `<div class="dash-status-item">
        <div class="dash-status-dot ${dotClass}"></div>
        <span class="dash-status-name">${name}</span>
        <span class="dash-status-label ${labelClass}">${label}</span>
    </div>`;
}

function renderRecentConversations(convs) {
    if (!convs || convs.length === 0) {
        return `<div class="dash-empty-state">
            <i class="fa-solid fa-comment-dots"></i>
            <p>No conversations yet</p>
            <a href="/chat">Start chatting →</a>
        </div>`;
    }
    return convs.slice(0, 5).map((c, i) => {
        const d = new Date(c.updated_at);
        const diff = Date.now() - d;
        const days = Math.floor(diff / 86400000);
        let timeStr = d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
        if (days === 0) {} else if (days === 1) timeStr = 'Yesterday'; else timeStr = `${days}d ago`;
        return `<a href="/chat" class="dash-conversation-item" style="animation-delay:${i * 60}ms;">
            <div class="dash-conv-icon">
                <i class="fa-solid fa-comment-dots"></i>
            </div>
            <div class="dash-conv-content">
                <div class="dash-conv-title">${escHtml(c.title || 'Untitled')}</div>
                <div class="dash-conv-time">${timeStr}</div>
            </div>
            <i class="fa-solid fa-arrow-right dash-conv-arrow"></i>
        </a>`;
    }).join('');
}

function escHtml(t) {
    if (!t) return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
