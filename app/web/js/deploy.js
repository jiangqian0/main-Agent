// Deploy Page JavaScript
let deployLogs = [];

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadDeployLogs();
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

async function loadDeployLogs() {
    try {
        const res = await fetch('/api/system/deploy/logs');
        if (res.ok) {
            const data = await res.json();
            deployLogs = data.logs || [];
            renderLogs();
            updateStats();
        }
    } catch (e) {
        console.error(e);
    }
}

function updateStats() {
    const success = deployLogs.filter(l => l.status === 'success').length;
    const failed = deployLogs.filter(l => l.status === 'failed').length;
    const pending = deployLogs.filter(l => l.status === 'pending' || l.status === 'in_progress').length;
    document.getElementById('stat-success').textContent = success;
    document.getElementById('stat-failed').textContent = failed;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-total').textContent = deployLogs.length;
}

function renderLogs() {
    const container = document.getElementById('deploy-logs');
    const empty = document.getElementById('deploy-empty');

    if (deployLogs.length === 0) {
        container.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    container.style.display = 'flex';
    container.innerHTML = deployLogs.map(log => logCard(log)).join('');
}

function logCard(log) {
    const statusConfig = {
        success: { color: '#10B981', icon: 'fa-circle-check', label: 'Success' },
        failed: { color: '#EF4444', icon: 'fa-circle-xmark', label: 'Failed' },
        pending: { color: '#F59E0B', icon: 'fa-spinner', label: 'Pending' },
        in_progress: { color: '#3B82F6', icon: 'fa-spinner fa-spin', label: 'In Progress' },
    };
    const cfg = statusConfig[log.status] || statusConfig.pending;
    const d = new Date(log.created_at);
    const timeStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border-color);border-radius:8px;background:var(--light-grey-bg);">
        <i class="fa-solid ${cfg.icon}" style="color:${cfg.color};font-size:16px;width:20px;flex-shrink:0;"></i>
        <div style="flex:1;min-width:0;">
            <div style="font-weight:500;font-size:13px;color:var(--text-primary);">${escHtml(log.project)}</div>
            <div style="font-size:11px;color:var(--grey);display:flex;gap:8px;margin-top:2px;">
                <span style="background:var(--border-color);padding:1px 6px;border-radius:3px;">${escHtml(log.environment)}</span>
                ${log.message ? `<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(log.message)}</span>` : ''}
            </div>
        </div>
        <div style="font-size:11px;color:var(--grey);flex-shrink:0;">${timeStr}</div>
        <button onclick="deleteLog('${log.id}')" style="padding:4px;background:none;border:none;cursor:pointer;color:var(--grey);flex-shrink:0;">
            <i class="fa-solid fa-trash-can" style="font-size:12px;"></i>
        </button>
    </div>`;
}

function showDeployDialog() {
    document.getElementById('deploy-project').value = '';
    document.getElementById('deploy-env').value = 'staging';
    document.getElementById('deploy-type').value = 'docker';
    document.getElementById('deploy-dialog').style.display = 'flex';
}

function closeDeployDialog() {
    document.getElementById('deploy-dialog').style.display = 'none';
}

async function startDeploy() {
    const project = document.getElementById('deploy-project').value.trim();
    const environment = document.getElementById('deploy-env').value;
    const type = document.getElementById('deploy-type').value;

    if (!project) { alert('Project name is required'); return; }

    closeDeployDialog();

    // Create a pending log
    try {
        await fetch('/api/system/deploy/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: project,
                environment: environment,
                status: 'pending',
                message: `Starting ${type} deployment to ${environment}...`,
            }),
        });
        loadDeployLogs();

        // Simulate async deployment
        setTimeout(async () => {
            const statuses = ['success', 'success', 'success', 'failed'];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const msgs = {
                success: 'Deployment completed successfully.',
                failed: 'Deployment failed: connection timeout.',
            };
            await fetch('/api/system/deploy/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    environment: environment,
                    status: status,
                    message: msgs[status],
                }),
            });
            loadDeployLogs();
        }, 3000);

    } catch (e) {
        alert('Deploy failed: ' + e.message);
    }
}

async function quickDeploy(project, env) {
    document.getElementById('deploy-project').value = project;
    document.getElementById('deploy-env').value = env;
    startDeploy();
}

async function deleteLog(id) {
    try {
        await fetch(`/api/system/deploy/logs/${id}`, { method: 'DELETE' });
        loadDeployLogs();
    } catch (e) {
        console.error(e);
    }
}

async function clearLogs() {
    if (!confirm('Clear all deployment history?')) return;
    for (const log of [...deployLogs]) {
        await fetch(`/api/system/deploy/logs/${log.id}`, { method: 'DELETE' }).catch(() => {});
    }
    loadDeployLogs();
}

function escHtml(t) {
    if (!t) return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
