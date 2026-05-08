// Monitoring Page JavaScript
let autoRefreshInterval = null;
let metricsData = {
    totalMessages: 0,
    avgResponseMs: 0,
    totalTokens: 0,
    toolCalls: 0,
    tokenHistory: [120, 340, 280, 510, 390, 220, 450],
    responseHistory: [820, 950, 1100, 780, 1050, 900, 870],
    activity: [],
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSidebarResize();
    loadMetrics();
    renderCharts();
    startAutoRefresh();
});

function checkAuth() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (!session) window.location.href = '/login';
}

function logout() {
    localStorage.removeItem('agent_session');
    sessionStorage.removeItem('agent_session');
    window.location.href = '/login';
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

function loadMetrics() {
    const convs = JSON.parse(localStorage.getItem('agent_conversations') || '[]');
    const sessions = JSON.parse(localStorage.getItem('agent_sessions') || '[]');

    metricsData.totalMessages = convs.reduce((acc, c) => acc + (c.message_count || 0), 0);
    metricsData.totalTokens = parseInt(localStorage.getItem('agent_tokens') || '0');
    metricsData.toolCalls = parseInt(localStorage.getItem('agent_toolcalls') || '0');
    metricsData.avgResponseMs = Math.floor(Math.random() * 500 + 600);

    // Build activity from conversations
    metricsData.activity = convs.slice(0, 10).map(c => ({
        time: c.updated_at,
        action: 'Chat completed',
        agent: c.model || 'qwen3-max',
        duration: Math.floor(Math.random() * 3000 + 500) + 'ms',
        tokens: Math.floor(Math.random() * 2000 + 200),
        status: 'success',
    }));

    renderMetrics();
    renderActivityTable();
}

function renderMetrics() {
    document.getElementById('metric-msgs').textContent = metricsData.totalMessages;
    document.getElementById('metric-avg-time').textContent = metricsData.avgResponseMs + 'ms';
    document.getElementById('metric-tokens').textContent = formatNum(metricsData.totalTokens);
    document.getElementById('metric-tools').textContent = metricsData.toolCalls;

    // Simulate system resource bars
    const cpu = Math.floor(Math.random() * 60 + 10);
    const mem = Math.floor(Math.random() * 50 + 20);
    const disk = Math.floor(Math.random() * 30 + 10);
    const latency = Math.floor(Math.random() * 40 + 20);

    document.getElementById('cpu-val').textContent = cpu + '%';
    document.getElementById('cpu-bar').style.width = cpu + '%';
    document.getElementById('cpu-bar').style.background = cpu > 80 ? '#EF4444' : '#3B82F6';

    document.getElementById('mem-val').textContent = mem + '%';
    document.getElementById('mem-bar').style.width = mem + '%';
    document.getElementById('mem-bar').style.background = mem > 80 ? '#EF4444' : '#10B981';

    document.getElementById('disk-val').textContent = disk + '%';
    document.getElementById('disk-bar').style.width = disk + '%';
    document.getElementById('disk-bar').style.background = disk > 80 ? '#EF4444' : '#F59E0B';

    document.getElementById('latency-val').textContent = latency + '%';
    document.getElementById('latency-bar').style.width = latency + '%';
    document.getElementById('latency-bar').style.background = latency > 80 ? '#EF4444' : '#7C3AED';
}

function renderCharts() {
    renderBarChart('token-chart', metricsData.tokenHistory, '#7C3AED');
    renderBarChart('response-chart', metricsData.responseHistory, '#10B981');
}

function renderBarChart(containerId, data, color) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const max = Math.max(...data);
    container.innerHTML = data.map(v => {
        const h = Math.max(4, (v / max) * 100);
        return `<div style="flex:1;height:${h}%;background:${color};border-radius:4px 4px 0 0;opacity:0.85;transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'" title="${v}"></div>`;
    }).join('');
}

function renderActivityTable() {
    const tbody = document.getElementById('activity-table');
    if (!metricsData.activity.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--grey);">No activity yet</td></tr>';
        return;
    }
    tbody.innerHTML = metricsData.activity.map(a => {
        const d = new Date(a.time);
        const timeStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const statusColor = a.status === 'success' ? '#10B981' : '#EF4444';
        const statusIcon = a.status === 'success' ? 'fa-circle-check' : 'fa-circle-xmark';
        return `<tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:10px 12px;font-size:12px;color:var(--grey);">${timeStr}</td>
            <td style="padding:10px 12px;font-size:13px;color:var(--text-primary);">${escHtml(a.action)}</td>
            <td style="padding:10px 12px;font-size:12px;color:var(--text-secondary);font-family:monospace;">${escHtml(a.agent)}</td>
            <td style="padding:10px 12px;font-size:12px;color:var(--text-secondary);">${a.duration}</td>
            <td style="padding:10px 12px;font-size:12px;color:var(--text-secondary);">${a.tokens}</td>
            <td style="padding:10px 12px;">
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${statusColor};">
                    <i class="fa-solid ${statusIcon}"></i> ${a.status}
                </span>
            </td>
        </tr>`;
    }).join('');
}

function refreshMetrics() {
    // Simulate new data on refresh
    metricsData.tokenHistory = metricsData.tokenHistory.map(v => Math.max(0, v + Math.floor(Math.random() * 200 - 100)));
    metricsData.responseHistory = metricsData.responseHistory.map(v => Math.max(0, v + Math.floor(Math.random() * 200 - 100)));
    metricsData.avgResponseMs = Math.floor(Math.random() * 500 + 600);
    renderMetrics();
    renderCharts();
}

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
        refreshMetrics();
    }, 5000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n;
}

function escHtml(t) {
    if (!t) return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
