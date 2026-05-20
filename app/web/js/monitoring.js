// Monitoring Page JavaScript — includes scheduled tasks management
const API_BASE = '/api';

// ─── State ────────────────────────────────────────────────────────────────────
let autoRefreshInterval = null;
let taskFilter = 'all';
let editingTaskId = null;
let allTasks = [];
let allHistory = [];

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadMetrics();
    renderCharts();
    loadTasks();
    loadHistory();
    startAutoRefresh();
});

// ─── Auth ────────────────────────────────────────────────────────────────────
function checkAuth() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (!session) window.location.href = '/login';
}

function logout() {
    localStorage.removeItem('agent_session');
    sessionStorage.removeItem('agent_session');
    window.location.href = '/login';
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
let metricsData = {
    totalMessages: 0,
    avgResponseMs: 0,
    totalTokens: 0,
    toolCalls: 0,
    tokenHistory: [120, 340, 280, 510, 390, 220, 450],
    responseHistory: [820, 950, 1100, 780, 1050, 900, 870],
    activity: [],
};

function loadMetrics() {
    const convs = JSON.parse(localStorage.getItem('agent_conversations') || '[]');
    metricsData.totalMessages = convs.reduce((acc, c) => acc + (c.message_count || 0), 0);
    metricsData.totalTokens = parseInt(localStorage.getItem('agent_tokens') || '0');
    metricsData.toolCalls = parseInt(localStorage.getItem('agent_toolcalls') || '0');
    metricsData.avgResponseMs = Math.floor(Math.random() * 500 + 600);

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

    const cpu = Math.floor(Math.random() * 60 + 10);
    const mem = Math.floor(Math.random() * 50 + 20);
    const disk = Math.floor(Math.random() * 30 + 10);
    const latency = Math.floor(Math.random() * 40 + 20);

    updateBar('cpu', cpu);
    updateBar('mem', mem);
    updateBar('disk', disk);
    updateBar('latency', latency);
}

function updateBar(id, val) {
    const valEl = document.getElementById(id + '-val');
    const barEl = document.getElementById(id + '-bar');
    if (!valEl || !barEl) return;
    valEl.textContent = val + '%';
    barEl.style.width = val + '%';
    const thresholds = { cpu: 80, mem: 80, disk: 80, latency: 60 };
    const colors = { cpu: '#3B82F6', mem: '#10B981', disk: '#F59E0B', latency: '#7C3AED' };
    barEl.style.background = val > (thresholds[id] || 80) ? '#EF4444' : (colors[id] || '#3B82F6');
}

function renderCharts() {
    renderBarChart('token-chart', metricsData.tokenHistory, '#7C3AED');
    renderBarChart('response-chart', metricsData.responseHistory, '#10B981');
}

function renderBarChart(containerId, data, color) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const max = Math.max(...data, 1);
    container.innerHTML = data.map(v => {
        const h = Math.max(4, (v / max) * 100);
        return `<div style="flex:1;height:${h}%;background:${color};border-radius:4px 4px 0 0;opacity:0.85;transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'" title="${v}"></div>`;
    }).join('');
}

function renderActivityTable() {
    const tbody = document.getElementById('activity-table');
    if (!tbody) return;
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
        loadHistory(true);
    }, 5000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// ─── Scheduled Tasks ────────────────────────────────────────────────────────────

async function loadTasks() {
    try {
        const resp = await fetch(`${API_BASE}/scheduler`);
        if (resp.ok) {
            const data = await resp.json();
            allTasks = data.tasks || [];
            renderTasks();
        }
    } catch (e) {
        showToast('Failed to load tasks', 'error');
    }
}

function renderTasks() {
    const list = document.getElementById('tasks-list');
    const empty = document.getElementById('tasks-empty');
    const badge = document.getElementById('task-count-badge');
    if (!list || !empty || !badge) return;

    const filtered = allTasks.filter(t => {
        if (taskFilter === 'all') return true;
        if (taskFilter === 'enabled') return t.enabled;
        if (taskFilter === 'presets') return t.is_preset;
        return true;
    });

    badge.textContent = `${allTasks.length} tasks`;

    if (filtered.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    list.style.display = 'flex';
    empty.style.display = 'none';

    list.innerHTML = filtered.map(task => renderTaskCard(task)).join('');

    // Style filter buttons
    document.querySelectorAll('.task-filter-btn').forEach(btn => {
        const active = btn.dataset.filter === taskFilter;
        btn.style.background = active ? 'var(--primary)' : '#fff';
        btn.style.color = active ? '#fff' : 'var(--grey)';
        btn.style.borderColor = active ? 'var(--primary)' : 'var(--border-color)';
    });
}

function renderTaskCard(task) {
    const enabled = task.enabled;
    const isPreset = task.is_preset;
    const scheduleText = getScheduleText(task.schedule_type, task.schedule_value);
    const statusColor = enabled ? '#10B981' : '#9CA3AF';
    const statusText = enabled ? 'Active' : 'Paused';
    const toggleIcon = enabled ? 'fa-pause' : 'fa-play';
    const toggleTitle = enabled ? 'Pause task' : 'Resume task';
    const cardBg = enabled ? 'rgba(0,105,60,0.04)' : 'rgba(0,0,0,0.02)';
    const borderColor = enabled ? 'rgba(0,105,60,0.2)' : 'var(--border-color)';
    const modeBadge = getModeBadge(task.mode);

    return `
    <div class="task-card ${enabled ? 'task-card-active' : ''}" style="
        background:${cardBg};
        border:1px solid ${borderColor};
        border-radius:10px;
        padding:14px 16px;
        transition:all 0.15s;
    ">
        <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="
                width:38px;height:38px;flex-shrink:0;
                background:${enabled ? 'rgba(0,105,60,0.1)' : 'rgba(0,0,0,0.05)'};
                border-radius:8px;
                display:flex;align-items:center;justify-content:center;
            ">
                <i class="fa-solid fa-clock-rotate-left" style="font-size:16px;color:${enabled ? 'var(--primary)' : '#9CA3AF'};"></i>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                    <span style="font-size:14px;font-weight:600;color:var(--text-primary);">${escHtml(task.name)}</span>
                    ${isPreset ? '<span style="font-size:10px;padding:1px 6px;background:rgba(124,58,237,0.1);color:#7C3AED;border-radius:4px;font-weight:500;">Preset</span>' : ''}
                    ${modeBadge}
                </div>
                <div style="font-size:12px;color:var(--grey);margin-bottom:6px;">${escHtml(task.description || 'No description')}</div>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${statusColor};">
                        <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${statusText}
                    </span>
                    <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--grey);">
                        <i class="fa-solid fa-calendar"></i> ${escHtml(scheduleText)}
                    </span>
                    <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--grey);">
                        <i class="fa-solid fa-cube"></i> ${escHtml(task.model || 'qwen3-max')}
                    </span>
                </div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
                <button onclick="runTaskNow('${task.id}')" title="Run now" style="
                    width:30px;height:30px;border:1px solid var(--border-color);border-radius:6px;
                    background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
                    color:var(--grey);transition:all 0.12s;
                " onmouseover="this.style.color='var(--primary)';this.style.borderColor='var(--primary)'"
                   onmouseout="this.style.color='var(--grey)';this.style.borderColor='var(--border-color)'">
                    <i class="fa-solid fa-play" style="font-size:11px;"></i>
                </button>
                <button onclick="toggleTask('${task.id}')" title="${toggleTitle}" style="
                    width:30px;height:30px;border:1px solid var(--border-color);border-radius:6px;
                    background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
                    color:var(--grey);transition:all 0.12s;
                " onmouseover="this.style.color='#F59E0B';this.style.borderColor='#F59E0B'"
                   onmouseout="this.style.color='var(--grey)';this.style.borderColor='var(--border-color)'">
                    <i class="fa-solid ${toggleIcon}" style="font-size:11px;"></i>
                </button>
                <button onclick="editTask('${task.id}')" title="Edit task" style="
                    width:30px;height:30px;border:1px solid var(--border-color);border-radius:6px;
                    background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
                    color:var(--grey);transition:all 0.12s;
                " onmouseover="this.style.color='var(--primary)';this.style.borderColor='var(--primary)'"
                   onmouseout="this.style.color='var(--grey)';this.style.borderColor='var(--border-color)'">
                    <i class="fa-solid fa-pen" style="font-size:11px;"></i>
                </button>
                ${!isPreset ? `
                <button onclick="deleteTask('${task.id}')" title="Delete task" style="
                    width:30px;height:30px;border:1px solid var(--border-color);border-radius:6px;
                    background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
                    color:var(--grey);transition:all 0.12s;
                " onmouseover="this.style.color='#EF4444';this.style.borderColor='#EF4444'"
                   onmouseout="this.style.color='var(--grey)';this.style.borderColor='var(--border-color)'">
                    <i class="fa-solid fa-trash" style="font-size:11px;"></i>
                </button>` : ''}
            </div>
        </div>
    </div>`;
}

function getModeBadge(mode) {
    const configs = {
        ask: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: 'Ask' },
        agent: { color: 'var(--primary)', bg: 'rgba(0,105,60,0.1)', label: 'Agent' },
        plan: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: 'Plan' },
    };
    const cfg = configs[mode] || configs.ask;
    return `<span style="font-size:10px;padding:1px 6px;background:${cfg.bg};color:${cfg.color};border-radius:4px;font-weight:500;">${cfg.label}</span>`;
}

function getScheduleText(type, value) {
    if (type === 'daily') return `Daily at ${value || '09:00'}`;
    if (type === 'weekly') {
        const days = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
        return `Every ${days[value] || value} at 09:00`;
    }
    if (type === 'once') return `One-time at ${value || '—'}`;
    return value || '—';
}

function setTaskFilter(filter) {
    taskFilter = filter;
    renderTasks();
}

// ─── Task Dialog ───────────────────────────────────────────────────────────────

function openTaskDialog(taskId) {
    editingTaskId = taskId || null;
    const dialog = document.getElementById('task-dialog-overlay');
    const title = document.getElementById('task-dialog-title');

    if (taskId) {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;
        title.innerHTML = '<i class="fa-solid fa-pen" style="color:var(--primary);"></i> Edit Scheduled Task';
        document.getElementById('task-name').value = task.name || '';
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-prompt').value = task.prompt || '';
        document.getElementById('task-schedule-type').value = task.schedule_type || 'once';
        document.getElementById('task-schedule-value').value = task.schedule_value || '09:00';
        document.getElementById('task-model').value = task.model || 'qwen3-max';
        document.getElementById('task-mode').value = task.mode || 'ask';
    } else {
        title.innerHTML = '<i class="fa-solid fa-plus" style="color:var(--primary);"></i> Add Scheduled Task';
        document.getElementById('task-name').value = '';
        document.getElementById('task-description').value = '';
        document.getElementById('task-prompt').value = '';
        document.getElementById('task-schedule-type').value = 'daily';
        document.getElementById('task-schedule-value').value = '09:00';
        document.getElementById('task-model').value = 'qwen3-max';
        document.getElementById('task-mode').value = 'ask';
    }

    updateScheduleValueUI();
    dialog.classList.add('show');
}

function editTask(taskId) {
    openTaskDialog(taskId);
}

function closeTaskDialog() {
    document.getElementById('task-dialog-overlay')?.classList.remove('show');
    editingTaskId = null;
}

function updateScheduleValueUI() {
    const type = document.getElementById('task-schedule-type')?.value || 'daily';
    const labelEl = document.getElementById('schedule-value-label');
    const inputEl = document.getElementById('task-schedule-value');
    const extraEl = document.getElementById('schedule-value-extra');
    const hintEl = document.getElementById('schedule-hint');

    if (type === 'daily') {
        if (labelEl) labelEl.textContent = 'Time';
        if (inputEl) { inputEl.type = 'time'; inputEl.value = '09:00'; }
        if (hintEl) hintEl.textContent = 'Daily: task runs at the specified time every day.';
    } else if (type === 'weekly') {
        if (labelEl) labelEl.textContent = 'Day';
        if (inputEl) {
            inputEl.type = 'text';
            inputEl.value = 'monday';
            inputEl.placeholder = 'monday / friday / ...';
        }
        if (hintEl) hintEl.textContent = 'Weekly: enter a day name (monday, tuesday, ..., sunday).';
    } else {
        if (labelEl) labelEl.textContent = 'Date & Time';
        if (inputEl) { inputEl.type = 'datetime-local'; inputEl.value = ''; }
        if (hintEl) hintEl.textContent = 'Once: task runs once at the specified date and time.';
    }
    if (extraEl) extraEl.style.display = 'flex';
}

async function saveTask() {
    const name = document.getElementById('task-name')?.value?.trim();
    const prompt = document.getElementById('task-prompt')?.value?.trim();

    if (!name) { showToast('Task name is required', 'error'); return; }
    if (!prompt) { showToast('Prompt is required', 'error'); return; }

    const body = {
        name,
        description: document.getElementById('task-description')?.value?.trim() || '',
        prompt,
        schedule_type: document.getElementById('task-schedule-type')?.value || 'daily',
        schedule_value: document.getElementById('task-schedule-value')?.value || '09:00',
        model: document.getElementById('task-model')?.value || 'qwen3-max',
        mode: document.getElementById('task-mode')?.value || 'ask',
        enabled: true,
    };

    try {
        let url = `${API_BASE}/scheduler`;
        let method = 'POST';
        if (editingTaskId) {
            url += '/' + editingTaskId;
            method = 'PUT';
        }
        const resp = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (resp.ok) {
            showToast(editingTaskId ? 'Task updated' : 'Task created');
            closeTaskDialog();
            loadTasks();
        } else {
            showToast('Failed to save task', 'error');
        }
    } catch (e) {
        showToast('Failed to save task', 'error');
    }
}

async function toggleTask(taskId) {
    try {
        const resp = await fetch(`${API_BASE}/scheduler/${taskId}/toggle`, { method: 'POST' });
        if (resp.ok) {
            const data = await resp.json();
            const idx = allTasks.findIndex(t => t.id === taskId);
            if (idx !== -1) allTasks[idx] = data.task;
            renderTasks();
            showToast(data.task.enabled ? 'Task enabled' : 'Task paused');
        }
    } catch (e) {
        showToast('Failed to toggle task', 'error');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Delete this scheduled task?')) return;
    try {
        const resp = await fetch(`${API_BASE}/scheduler/${taskId}`, { method: 'DELETE' });
        if (resp.ok) {
            showToast('Task deleted');
            loadTasks();
        }
    } catch (e) {
        showToast('Failed to delete task', 'error');
    }
}

async function runTaskNow(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    showToast(`Running "${task.name}"...`, 'info');
    try {
        const resp = await fetch(`${API_BASE}/scheduler/${taskId}/run`, { method: 'POST' });
        if (resp.ok) {
            const data = await resp.json();
            showToast(`Task "${task.name}" started`, 'success');
            loadHistory();
        } else {
            showToast('Failed to run task', 'error');
        }
    } catch (e) {
        showToast('Failed to run task', 'error');
    }
}

// ─── Execution History ─────────────────────────────────────────────────────────

async function loadHistory(silent) {
    try {
        const resp = await fetch(`${API_BASE}/scheduler/history/all?limit=50`);
        if (resp.ok) {
            const data = await resp.json();
            allHistory = data.history || [];
            renderHistory();
        }
    } catch (e) {
        if (!silent) showToast('Failed to load history', 'error');
    }
}

function renderHistory() {
    const tbody = document.getElementById('history-table');
    if (!tbody) return;

    if (!allHistory.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--grey);">No execution history yet</td></tr>';
        return;
    }

    tbody.innerHTML = allHistory.map(r => {
        const started = new Date(r.started_at);
        const timeStr = started.toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });

        let duration = '—';
        if (r.finished_at) {
            const ms = new Date(r.finished_at) - started;
            duration = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
        }

        const statusColor = r.status === 'success' ? '#10B981' : r.status === 'running' ? '#3B82F6' : '#EF4444';
        const statusIcon = r.status === 'success' ? 'fa-circle-check' : r.status === 'running' ? 'fa-spinner fa-spin' : 'fa-circle-xmark';

        return `<tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:10px 12px;font-size:13px;color:var(--text-primary);font-weight:500;">${escHtml(r.task_name || 'Unknown')}</td>
            <td style="padding:10px 12px;font-size:12px;color:var(--grey);">${timeStr}</td>
            <td style="padding:10px 12px;font-size:12px;color:var(--text-secondary);">${duration}</td>
            <td style="padding:10px 12px;">
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${statusColor};">
                    <i class="fa-solid ${statusIcon}"></i> ${r.status}
                </span>
            </td>
            <td style="padding:10px 12px;">
                ${r.result ? `
                <button onclick="showResult('${r.id}')" style="
                    padding:4px 10px;border:1px solid var(--border-color);border-radius:5px;
                    font-size:11px;cursor:pointer;background:#fff;color:var(--grey);
                ">View</button>` : ''}
                <button onclick="rerunTask('${r.task_id}')" title="Re-run task" style="
                    padding:4px 8px;border:1px solid var(--border-color);border-radius:5px;
                    font-size:11px;cursor:pointer;background:#fff;color:var(--grey);
                    margin-left:4px;
                "><i class="fa-solid fa-rotate-right"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function showResult(runId) {
    const record = allHistory.find(r => r.id === runId);
    if (!record) return;

    const dialog = document.getElementById('result-dialog-overlay');
    const title = document.getElementById('result-dialog-title');
    const info = document.getElementById('result-task-info');
    const content = document.getElementById('result-content');

    const started = new Date(record.started_at).toLocaleString();
    const duration = record.finished_at
        ? ((new Date(record.finished_at) - new Date(record.started_at)) / 1000).toFixed(1) + 's'
        : 'running...';

    title.innerHTML = `<i class="fa-solid fa-clipboard-list" style="color:var(--primary);"></i> Result: ${escHtml(record.task_name || 'Task')}`;
    info.innerHTML = `<strong>Model:</strong> ${escHtml(record.model || 'qwen3-max')} &nbsp;|&nbsp; <strong>Started:</strong> ${started} &nbsp;|&nbsp; <strong>Duration:</strong> ${duration} &nbsp;|&nbsp; <strong>Status:</strong> ${escHtml(record.status)}`;
    content.textContent = record.result || record.error || 'No result available.';
    window._currentResult = record.result || '';

    dialog.classList.add('show');
}

function closeResultDialog() {
    document.getElementById('result-dialog-overlay')?.classList.remove('show');
}

function copyResult() {
    const text = window._currentResult || '';
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
    }
}

async function rerunTask(taskId) {
    await runTaskNow(taskId);
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n;
}

function escHtml(t) {
    if (!t) return '';
    return String(t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'success') {
    // Reuse toast mechanism if available
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
        return;
    }
    // Fallback inline toast
    const body = document.body;
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        background:${type === 'error' ? '#EF4444' : type === 'info' ? '#3B82F6' : '#10B981'};
        color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;
        animation:toastSlideIn 0.2s ease;
    `;
    toast.textContent = msg;
    const style = document.createElement('style');
    style.textContent = '@keyframes toastSlideIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}';
    document.head.appendChild(style);
    body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Close dialogs on overlay click
document.addEventListener('click', e => {
    if (e.target.classList.contains('dialog-overlay')) {
        e.target.classList.remove('show');
    }
});
