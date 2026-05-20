// Agents Page JavaScript
let agents = [];
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadAgents();
});

function checkAuth() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (!session) window.navigateTo('/login');
}

function logout() {
    localStorage.removeItem('agent_session');
    sessionStorage.removeItem('agent_session');
    window.navigateTo('/login');
}

async function loadAgents() {
    try {
        const res = await fetch('/api/agents');
        if (res.ok) {
            const data = await res.json();
            agents = data.agents || [];
            renderAgents();
            updateStats();
        }
    } catch (e) {
        console.error(e);
    }
}

function updateStats() {
    const active = agents.filter(a => a.enabled).length;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-total').textContent = agents.length;
}

function renderAgents() {
    const list = document.getElementById('agents-list');
    const empty = document.getElementById('agents-empty');

    if (agents.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.style.display = 'grid';
    list.innerHTML = agents.map(a => agentCard(a)).join('');
}

function agentCard(a) {
    const typeColors = {
        assistant: '#3B82F6',
        security: '#EF4444',
        devops: '#F59E0B',
        qa: '#8B5CF6',
    };
    const color = typeColors[a.type] || '#6B7280';
    const enabled = a.enabled;
    const typeLabels = {
        assistant: 'Assistant',
        security: 'Security',
        devops: 'DevOps',
        qa: 'QA / Testing',
    };

    return `<div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:flex-start;gap:14px;">
            <div style="width:44px;height:44px;background:${color}15;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-robot" style="color:${color};font-size:20px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-weight:600;font-size:15px;color:var(--text-primary);">${escHtml(a.name)}</span>
                    <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${color}15;color:${color};font-weight:500;">${typeLabels[a.type] || a.type}</span>
                    ${a.is_builtin ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#F3F4F6;color:#6B7280;font-weight:500;">Built-in</span>` : ''}
                </div>
                <div style="font-size:12px;color:var(--grey);margin-top:3px;line-height:1.4;">${escHtml(a.description || 'No description')}</div>
            </div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${(a.skills || []).map(s => `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:var(--light-grey-bg);color:var(--text-secondary);">${escHtml(s)}</span>`).join('')}
        </div>

        <div style="display:flex;align-items:center;gap:8px;padding-top:8px;border-top:1px solid var(--border-color);">
            <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:8px;height:8px;border-radius:50%;background:${enabled ? '#10B981' : '#9CA3AF'};flex-shrink:0;"></div>
                <span style="font-size:12px;color:${enabled ? '#10B981' : '#9CA3AF'};font-weight:500;">${enabled ? 'Active' : 'Inactive'}</span>
            </div>
            <div style="margin-left:auto;display:flex;gap:6px;">
                <button onclick="toggleAgent('${a.id}')" title="${enabled ? 'Deactivate' : 'Activate'}" style="padding:5px 10px;border:1px solid var(--border-color);border-radius:5px;background:#fff;cursor:pointer;font-size:12px;color:${enabled ? '#EF4444' : '#10B981'};">
                    <i class="fa-solid ${enabled ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                ${!a.is_builtin ? `
                <button onclick="editAgent('${a.id}')" title="Edit" style="padding:5px 10px;border:1px solid var(--border-color);border-radius:5px;background:#fff;cursor:pointer;font-size:12px;color:var(--grey);">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="deleteAgent('${a.id}')" title="Delete" style="padding:5px 10px;border:1px solid var(--border-color);border-radius:5px;background:#fff;cursor:pointer;font-size:12px;color:#EF4444;">
                    <i class="fa-solid fa-trash"></i>
                </button>` : ''}
            </div>
        </div>
    </div>`;
}

function showCreateDialog() {
    editingId = null;
    document.getElementById('dialog-title').textContent = 'Create Agent';
    document.getElementById('agent-name').value = '';
    document.getElementById('agent-type').value = 'assistant';
    document.getElementById('agent-desc').value = '';
    document.getElementById('agent-prompt').value = '';
    document.getElementById('agent-model').value = 'qwen3-max';
    document.getElementById('agent-dialog').style.display = 'flex';
}

function editAgent(id) {
    const a = agents.find(a => a.id === id);
    if (!a) return;
    editingId = id;
    document.getElementById('dialog-title').textContent = 'Edit Agent';
    document.getElementById('agent-name').value = a.name;
    document.getElementById('agent-type').value = a.type;
    document.getElementById('agent-desc').value = a.description || '';
    document.getElementById('agent-prompt').value = a.system_prompt || '';
    document.getElementById('agent-model').value = a.model || '';
    document.getElementById('agent-dialog').style.display = 'flex';
}

function closeDialog() {
    document.getElementById('agent-dialog').style.display = 'none';
    editingId = null;
}

async function saveAgent() {
    const name = document.getElementById('agent-name').value.trim();
    const type = document.getElementById('agent-type').value;
    const description = document.getElementById('agent-desc').value.trim();
    const system_prompt = document.getElementById('agent-prompt').value.trim();
    const model = document.getElementById('agent-model').value.trim();

    if (!name) { alert('Name is required'); return; }

    const payload = { name, type, description, system_prompt, model };
    try {
        let res;
        if (editingId) {
            res = await fetch(`/api/agents/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }
        if (res.ok) {
            closeDialog();
            loadAgents();
        } else {
            const err = await res.json();
            alert('Error: ' + (err.detail || 'Unknown error'));
        }
    } catch (e) {
        alert('Failed: ' + e.message);
    }
}

async function toggleAgent(id) {
    try {
        const res = await fetch(`/api/agents/${id}/toggle`, { method: 'POST' });
        if (res.ok) loadAgents();
    } catch (e) {
        alert('Failed: ' + e.message);
    }
}

async function deleteAgent(id) {
    if (!confirm('Delete this agent?')) return;
    try {
        const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
        if (res.ok) loadAgents();
        else {
            const err = await res.json();
            alert(err.detail || 'Cannot delete');
        }
    } catch (e) {
        alert('Failed: ' + e.message);
    }
}

function escHtml(t) {
    if (!t) return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
