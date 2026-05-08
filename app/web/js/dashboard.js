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
        <div style="padding:24px 32px;background:var(--light-grey-bg);flex:1;overflow-y:auto;">
            <!-- Welcome -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                <div>
                    <h1 style="font-size:24px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">
                        Good ${greeting}, ${escHtml(name)}
                    </h1>
                    <p style="font-size:14px;color:var(--grey);">Here's an overview of your agent activity.</p>
                </div>
                <a href="/chat" style="background:var(--primary);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:500;display:flex;align-items:center;gap:8px;text-decoration:none;">
                    <i class="fa-solid fa-plus"></i> New Chat
                </a>
            </div>

            <!-- Stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
                <div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:20px;display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;background:rgba(0,105,60,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;">
                        <i class="fa-solid fa-comment-dots" style="color:var(--primary);font-size:20px;"></i>
                    </div>
                    <div>
                        <div style="font-size:28px;font-weight:700;color:var(--text-primary);">${convCount}</div>
                        <div style="font-size:13px;color:var(--grey);">Conversations</div>
                    </div>
                </div>
                <div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:20px;display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;background:rgba(0,45,98,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;">
                        <i class="fa-solid fa-code" style="color:#002D62;font-size:20px;"></i>
                    </div>
                    <div>
                        <div style="font-size:28px;font-weight:700;color:var(--text-primary);">${skillCount}</div>
                        <div style="font-size:13px;color:var(--grey);">Active Skills</div>
                    </div>
                </div>
                <div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:20px;display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;background:rgba(16,185,129,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;">
                        <i class="fa-solid fa-folder-open" style="color:#10B981;font-size:20px;"></i>
                    </div>
                    <div>
                        <div style="font-size:28px;font-weight:700;color:var(--text-primary);">${fileCount}</div>
                        <div style="font-size:13px;color:var(--grey);">Workspace Files</div>
                    </div>
                </div>
                <div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:20px;display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;background:rgba(245,158,11,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;">
                        <i class="fa-solid fa-puzzle-piece" style="color:#F59E0B;font-size:20px;"></i>
                    </div>
                    <div>
                        <div style="font-size:28px;font-weight:700;color:var(--text-primary);">6</div>
                        <div style="font-size:13px;color:var(--grey);">Built-in Tools</div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions + Recent -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:20px;">
                    <h2 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                        <i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Quick Actions
                    </h2>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${quickAction('/chat', 'fa-code', 'Code Development', 'Generate, review, and refactor code', 'var(--primary)')}
                        ${quickAction('/workspace', 'fa-folder-open', 'Browse Workspace', 'View and edit project files', '#10B981')}
                        ${quickAction('/skills', 'fa-puzzle-piece', 'Manage Skills', 'Customize agent capabilities', '#F59E0B')}
                        ${quickAction('/knowledge', 'fa-book-open', 'Knowledge Base', 'Manage reference documents', '#002D62')}
                        ${quickAction('/agents', 'fa-robot', 'Agent Center', 'Configure AI agents', '#7C3AED')}
                        ${quickAction('/deploy', 'fa-rocket', 'Deployment & Ops', 'Deploy and manage applications', '#DC2626')}
                    </div>
                </div>

                <div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:20px;">
                    <h2 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                        <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary);"></i> Recent Conversations
                    </h2>
                    <div id="recent-list">
                        ${renderRecentConversations(convs)}
                    </div>
                </div>
            </div>

            <!-- System Status -->
            <div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:20px;">
                <h2 style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                    <i class="fa-solid fa-circle-check" style="color:#10B981;"></i> System Status
                </h2>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
                    ${systemStatusItem('API Service', true)}
                    ${systemStatusItem('Skill Engine', true)}
                    ${systemStatusItem('Workspace Storage', true)}
                    ${systemStatusItem('Knowledge Base', true)}
                </div>
            </div>
        </div>
    `;
}

function quickAction(href, icon, title, desc, color) {
    return `<a href="${href}" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border-color);border-radius:8px;text-decoration:none;color:var(--text-primary);transition:border-color 0.2s,background 0.2s;" onmouseover="this.style.borderColor='var(--primary)';this.style.background='var(--primary-bg)'" onmouseout="this.style.borderColor='var(--border-color)';this.style.background='transparent'">
        <i class="fa-solid ${icon}" style="width:20px;text-align:center;color:${color};"></i>
        <div style="flex:1;">
            <div style="font-weight:500;font-size:13px;">${title}</div>
            <div style="font-size:11px;color:var(--grey);">${desc}</div>
        </div>
        <i class="fa-solid fa-arrow-right" style="color:var(--grey);font-size:12px;"></i>
    </a>`;
}

function systemStatusItem(name, operational) {
    const color = operational ? '#10B981' : '#EF4444';
    const label = operational ? 'Operational' : 'Offline';
    return `<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--light-grey-bg);border-radius:8px;">
        <div style="width:8px;height:8px;background:${color};border-radius:50%;flex-shrink:0;"></div>
        <span style="font-size:13px;color:var(--text-secondary);">${name}</span>
        <span style="font-size:11px;color:${color};margin-left:auto;font-weight:500;">${label}</span>
    </div>`;
}

function renderRecentConversations(convs) {
    if (!convs || convs.length === 0) {
        return `<div style="text-align:center;padding:32px;color:var(--grey);">
            <i class="fa-solid fa-comment-dots" style="font-size:32px;margin-bottom:8px;opacity:0.3;display:block;"></i>
            <div style="font-size:13px;margin-bottom:8px;">No conversations yet</div>
            <a href="/chat" style="color:var(--primary);font-size:13px;">Start chatting →</a>
        </div>`;
    }
    return convs.slice(0, 5).map(c => {
        const d = new Date(c.updated_at);
        const diff = Date.now() - d;
        const days = Math.floor(diff / 86400000);
        let timeStr = d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
        if (days === 0) {} else if (days === 1) timeStr = 'Yesterday'; else timeStr = `${days}d ago`;
        return `<a href="/chat" style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-radius:6px;text-decoration:none;color:var(--text-primary);transition:background 0.15s;" onmouseover="this.style.background='var(--light-grey-bg)'" onmouseout="this.style.background='transparent'">
            <i class="fa-solid fa-comment-dots" style="width:20px;text-align:center;color:var(--primary);flex-shrink:0;"></i>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(c.title || 'Untitled')}</div>
                <div style="font-size:11px;color:var(--grey);">${timeStr}</div>
            </div>
            <i class="fa-solid fa-arrow-right" style="color:var(--grey);font-size:12px;flex-shrink:0;"></i>
        </a>`;
    }).join('');
}

function escHtml(t) {
    if (!t) return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
