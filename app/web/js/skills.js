// Skills Page JavaScript
const API_BASE_URL = '/api';
let skills = [];

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadSkills();
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

function loadSkills() {
    fetch(`${API_BASE_URL}/skills`)
        .then(r => r.json())
        .then(data => {
            skills = Array.isArray(data) ? data : (data.skills || []);
            renderSkills();
        })
        .catch(() => {
            document.getElementById('skills-grid').innerHTML = '<div class="loading-state"><i class="fa-solid fa-exclamation-circle"></i> Failed to load skills</div>';
        });
}

function renderSkills() {
    const grid = document.getElementById('skills-grid');
    if (skills.length === 0) {
        grid.innerHTML = '<div class="loading-state"><i class="fa-solid fa-puzzle-piece"></i> No skills available</div>';
        return;
    }
    grid.innerHTML = skills.map(s => `
        <div class="skill-card" data-id="${s.id}">
            <div class="skill-card-header">
                <div class="skill-card-title-row">
                    <i class="${s.icon || 'fa-solid fa-puzzle-piece'}" style="font-size:16px;color:var(--primary);margin-right:8px;"></i>
                    <h3>${escHtml(s.name)}</h3>
                </div>
                <span class="skill-badge ${s.enabled ? 'enabled' : 'disabled'}">${s.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <p class="skill-card-desc">${escHtml(s.description || 'No description')}</p>
            <div class="skill-card-tags">
                ${(s.tags||[]).slice(0,4).map(t => `<span class="skill-tag">${escHtml(t)}</span>`).join('')}
            </div>
            <div class="skill-card-tools">
                ${(s.allowed_tools||[]).map(t => `<span class="tool-chip"><i class="fa-solid fa-gear"></i>${t}</span>`).join('')}
            </div>
            <div class="skill-card-footer">
                <span>${escHtml(s.category || 'Uncategorized')} &bull; v${s.version || '1.0.0'}${s.is_builtin ? ' &bull; <span style="color:var(--primary)">Built-in</span>' : ''}</span>
                <div class="skill-card-actions">
                    <button onclick="toggleSkill('${s.id}')" title="${s.enabled ? 'Disable' : 'Enable'}">
                        <i class="fa-solid ${s.enabled ? 'fa-ban' : 'fa-check'}"></i>
                    </button>
                    <button onclick="editSkill('${s.id}')" title="Edit"><i class="fa-solid fa-pencil"></i></button>
                    ${!s.is_builtin ? '<button onclick="deleteSkill(\'' + s.id + '\')" title="Delete"><i class="fa-solid fa-trash"></i></button>' : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function showCreateDialog() {
    document.getElementById('dialog-title').textContent = 'Create Skill';
    document.getElementById('dialog-body').innerHTML = buildSkillForm();
    document.getElementById('dialog-confirm').textContent = 'Create';
    document.getElementById('dialog-confirm').onclick = createSkill;
    document.getElementById('dialog-overlay').classList.add('show');
    document.getElementById('skill-name').focus();
}

function editSkill(id) {
    const skill = skills.find(s => s.id === id);
    if (!skill) return;
    document.getElementById('dialog-title').textContent = 'Edit Skill';
    document.getElementById('dialog-body').innerHTML = buildSkillForm(skill);
    document.getElementById('dialog-confirm').textContent = 'Save Changes';
    document.getElementById('dialog-confirm').onclick = () => updateSkill(id);
    document.getElementById('dialog-overlay').classList.add('show');
    document.getElementById('skill-name').focus();
}

function buildSkillForm(skill) {
    const s = skill || {};
    const keywords = (s.trigger_keywords || []).join(', ');

    const iconOptions = [
        'fa-code', 'fa-brands fa-python', 'fa-globe', 'fa-terminal',
        'fa-magnifying-glass', 'fa-wand-magic-sparkles', 'fa-database',
        'fa-server', 'fa-shield-halved', 'fa-robot', 'fa-brain',
        'fa-bolt', 'fa-chart-line', 'fa-book', 'fa-file-code',
    ];
    const selectedIcon = s.icon || 'fa-code';

    const toolOptions = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];
    const selectedTools = s.allowed_tools || [];

    return `
        <div class="form-group">
            <label>Name *</label>
            <input type="text" id="skill-name" value="${escHtml(s.name || '')}" placeholder="e.g., Python Expert">
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea id="skill-desc" placeholder="Describe what this skill does..." rows="2">${escHtml(s.description || '')}</textarea>
        </div>
        <div class="form-row-2">
            <div class="form-group">
                <label>Category</label>
                <input type="text" id="skill-category" value="${escHtml(s.category || '')}" placeholder="e.g., Language">
            </div>
            <div class="form-group">
                <label>Icon</label>
                <div class="icon-picker" id="icon-picker">
                    ${iconOptions.map(ic => `
                        <button type="button" class="icon-option ${selectedIcon === ic ? 'selected' : ''}" data-icon="${ic}" onclick="selectIcon('${ic}')">
                            <i class="fa-solid ${ic}"></i>
                        </button>
                    `).join('')}
                </div>
                <input type="hidden" id="skill-icon" value="${selectedIcon}">
            </div>
        </div>
        <div class="form-group">
            <label>Trigger Keywords</label>
            <input type="text" id="skill-keywords" value="${escHtml(keywords)}" placeholder="Comma-separated: python, fastapi, data">
            <p class="form-hint">The agent auto-selects this skill when user's message contains these keywords</p>
        </div>
        <div class="form-group">
            <label>System Prompt Addition</label>
            <textarea id="skill-prompt" placeholder="Additional instructions for this skill (e.g., coding style, specific behaviors)..." rows="4">${escHtml(s.system_prompt_addition || '')}</textarea>
        </div>
        <div class="form-group">
            <label>Allowed Tools</label>
            <div class="tools-grid" id="tools-grid">
                ${toolOptions.map(tool => `
                    <label class="tool-checkbox-label ${selectedTools.includes(tool) ? 'selected' : ''}" onclick="toggleToolCheckbox(this, '${tool}')">
                        <input type="checkbox" id="tool-${tool}" value="${tool}" ${selectedTools.includes(tool) ? 'checked' : ''}>
                        <i class="fa-solid fa-gear"></i> ${tool}
                    </label>
                `).join('')}
            </div>
            <input type="hidden" id="skill-tools" value="${selectedTools.join(',')}">
        </div>
        <div class="form-group">
            <label>Tags</label>
            <input type="text" id="skill-tags" value="${(s.tags||[]).join(', ')}" placeholder="Comma-separated: python, backend, api">
        </div>
    `;
}

function selectIcon(ic) {
    document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.icon-option[data-icon="${ic}"]`)?.classList.add('selected');
    document.getElementById('skill-icon').value = ic;
}

function toggleToolCheckbox(el, tool) {
    el.classList.toggle('selected');
    const checked = el.classList.contains('selected');
    document.getElementById(`tool-${tool}`).checked = checked;
    updateToolsField();
}

function updateToolsField() {
    const tools = [...document.querySelectorAll('#tools-grid input:checked')].map(i => i.value);
    document.getElementById('skill-tools').value = tools.join(',');
}

function createSkill() {
    const name = document.getElementById('skill-name').value.trim();
    if (!name) { showToast('Please enter a name', 'error'); return; }
    updateToolsField();
    const skill = {
        name,
        description: document.getElementById('skill-desc').value.trim(),
        category: document.getElementById('skill-category').value.trim() || 'Custom',
        icon: document.getElementById('skill-icon').value,
        trigger_keywords: document.getElementById('skill-keywords').value.split(',').map(k => k.trim()).filter(Boolean),
        system_prompt_addition: document.getElementById('skill-prompt').value.trim(),
        allowed_tools: document.getElementById('skill-tools').value.split(',').map(t => t.trim()).filter(Boolean),
        tags: document.getElementById('skill-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    };
    fetch(`${API_BASE_URL}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skill)
    }).then(r => r.ok ? r.json() : Promise.reject()).then(() => {
        hideDialog();
        loadSkills();
        showToast('Skill created');
    }).catch(() => showToast('Failed to create skill', 'error'));
}

function updateSkill(id) {
    const name = document.getElementById('skill-name').value.trim();
    if (!name) { showToast('Please enter a name', 'error'); return; }
    updateToolsField();
    const existing = skills.find(s => s.id === id);
    if (!existing) return;
    const skill = {
        ...existing,
        name,
        description: document.getElementById('skill-desc').value.trim(),
        category: document.getElementById('skill-category').value.trim() || 'Custom',
        icon: document.getElementById('skill-icon').value,
        trigger_keywords: document.getElementById('skill-keywords').value.split(',').map(k => k.trim()).filter(Boolean),
        system_prompt_addition: document.getElementById('skill-prompt').value.trim(),
        allowed_tools: document.getElementById('skill-tools').value.split(',').map(t => t.trim()).filter(Boolean),
        tags: document.getElementById('skill-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    };
    fetch(`${API_BASE_URL}/skills/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skill)
    }).then(r => r.ok ? r.json() : Promise.reject()).then(() => {
        hideDialog();
        loadSkills();
        showToast('Skill updated');
    }).catch(() => showToast('Failed to update skill', 'error'));
}

function toggleSkill(id) {
    const skill = skills.find(s => s.id === id);
    if (!skill) return;
    fetch(`${API_BASE_URL}/skills/${id}/toggle`, { method: 'PATCH' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(() => { loadSkills(); showToast(skill.enabled ? 'Skill disabled' : 'Skill enabled'); })
        .catch(() => showToast('Failed to update skill', 'error'));
}

function deleteSkill(id) {
    if (!confirm('Delete this skill? This cannot be undone.')) return;
    fetch(`${API_BASE_URL}/skills/${id}`, { method: 'DELETE' })
        .then(r => r.ok ? null : Promise.reject())
        .then(() => { loadSkills(); showToast('Skill deleted'); })
        .catch(() => showToast('Failed to delete skill (may be a built-in)', 'error'));
}

function hideDialog() {
    document.getElementById('dialog-overlay').classList.remove('show');
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : 'xmark'}"></i>${msg}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
