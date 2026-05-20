// Resources Page JavaScript
let resources = [];
let currentFilter = 'all';
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadResources();
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

async function loadResources() {
    try {
        const res = await fetch('/api/system/resources');
        if (res.ok) {
            const data = await res.json();
            resources = data.resources || [];
            renderResources();
        }
    } catch (e) {
        console.error('Failed to load resources:', e);
    }
}

function setFilter(type, btn) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderResources();
}

function renderResources() {
    const list = document.getElementById('resources-list');
    const empty = document.getElementById('empty-state');
    const search = document.getElementById('search-input').value.toLowerCase();

    let filtered = resources;
    if (currentFilter !== 'all') {
        filtered = filtered.filter(r => r.type === currentFilter);
    }
    if (search) {
        filtered = filtered.filter(r =>
            r.name.toLowerCase().includes(search) ||
            (r.description || '').toLowerCase().includes(search)
        );
    }

    if (filtered.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.style.display = 'flex';
    list.innerHTML = filtered.map(r => resourceCard(r)).join('');
}

function resourceCard(r) {
    const typeIcons = {
        variable: 'fa-brackets-curly',
        secret: 'fa-lock',
        api: 'fa-key',
        config: 'fa-sliders',
    };
    const typeColors = {
        variable: '#3B82F6',
        secret: '#EF4444',
        api: '#F59E0B',
        config: '#8B5CF6',
    };
    const icon = typeIcons[r.type] || 'fa-database';
    const color = typeColors[r.type] || '#6B7280';
    const displayValue = r.type === 'secret' || r.type === 'api'
        ? (r.value ? r.value.substring(0, 4) + '****' + r.value.substring(r.value.length - 4) : '')
        : r.value;

    return `<div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:16px 20px;display:flex;align-items:center;gap:16px;">
        <div style="width:40px;height:40px;background:${color}15;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fa-solid ${icon}" style="color:${color};font-size:16px;"></i>
        </div>
        <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;color:var(--text-primary);margin-bottom:2px;">${escHtml(r.name)}</div>
            <div style="font-size:12px;color:var(--grey);display:flex;gap:8px;align-items:center;">
                <span style="background:${color}15;color:${color};padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500;">${r.type}</span>
                ${r.category ? `<span>${escHtml(r.category)}</span>` : ''}
            </div>
            ${r.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(r.description)}</div>` : ''}
        </div>
        <div style="font-family:monospace;font-size:12px;color:var(--text-secondary);background:var(--light-grey-bg);padding:4px 10px;border-radius:4px;flex-shrink:0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escHtml(displayValue || '—')}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
            <button onclick="copyValue('${escHtml(r.value || '')}')" title="Copy value" style="padding:6px;background:none;border:1px solid var(--border-color);border-radius:5px;cursor:pointer;color:var(--grey);">
                <i class="fa-regular fa-copy" style="font-size:13px;"></i>
            </button>
            <button onclick="editResource('${r.id}')" title="Edit" style="padding:6px;background:none;border:1px solid var(--border-color);border-radius:5px;cursor:pointer;color:var(--grey);">
                <i class="fa-solid fa-pen" style="font-size:13px;"></i>
            </button>
            <button onclick="deleteResource('${r.id}')" title="Delete" style="padding:6px;background:none;border:1px solid var(--border-color);border-radius:5px;cursor:pointer;color:#EF4444;">
                <i class="fa-solid fa-trash" style="font-size:13px;"></i>
            </button>
        </div>
    </div>`;
}

function showCreateDialog() {
    editingId = null;
    document.getElementById('dialog-title').textContent = 'Add Resource';
    document.getElementById('res-name').value = '';
    document.getElementById('res-type').value = 'variable';
    document.getElementById('res-category').value = '';
    document.getElementById('res-value').value = '';
    document.getElementById('res-description').value = '';
    document.getElementById('resource-dialog').style.display = 'flex';
}

function editResource(id) {
    const r = resources.find(r => r.id === id);
    if (!r) return;
    editingId = id;
    document.getElementById('dialog-title').textContent = 'Edit Resource';
    document.getElementById('res-name').value = r.name;
    document.getElementById('res-type').value = r.type;
    document.getElementById('res-category').value = r.category || '';
    document.getElementById('res-value').value = r.value;
    document.getElementById('res-description').value = r.description || '';
    document.getElementById('resource-dialog').style.display = 'flex';
}

function closeDialog() {
    document.getElementById('resource-dialog').style.display = 'none';
    editingId = null;
}

async function saveResource() {
    const name = document.getElementById('res-name').value.trim();
    const type = document.getElementById('res-type').value;
    const category = document.getElementById('res-category').value.trim();
    const value = document.getElementById('res-value').value;
    const description = document.getElementById('res-description').value.trim();

    if (!name) { alert('Name is required'); return; }
    if (!value) { alert('Value is required'); return; }

    const payload = { name, type, value, category, description };
    try {
        let res;
        if (editingId) {
            res = await fetch(`/api/system/resources/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            res = await fetch('/api/system/resources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }
        if (res.ok) {
            closeDialog();
            loadResources();
        } else {
            const err = await res.json();
            alert('Error: ' + (err.detail || 'Unknown error'));
        }
    } catch (e) {
        alert('Failed to save: ' + e.message);
    }
}

async function deleteResource(id) {
    if (!confirm('Delete this resource?')) return;
    try {
        const res = await fetch(`/api/system/resources/${id}`, { method: 'DELETE' });
        if (res.ok) loadResources();
    } catch (e) {
        alert('Failed to delete: ' + e.message);
    }
}

function copyValue(value) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
        showToast('Copied to clipboard', 'success');
    });
}

function showToast(message, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:10px 20px;background:' +
        (type === 'success' ? '#10B981' : '#EF4444') +
        ';color:#fff;border-radius:8px;font-size:13px;z-index:9999;animation:fadeIn 0.2s;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escHtml(t) {
    if (!t) return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
