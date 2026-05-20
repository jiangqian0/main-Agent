// Documents & Reports Page JavaScript
let docs = [];
let currentCategory = 'all';
let editingId = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadDocs();
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

function loadDocs() {
    const stored = localStorage.getItem('agent_docs');
    docs = stored ? JSON.parse(stored) : getSampleDocs();
    if (!stored) saveDocs();
    renderDocs();
}

function getSampleDocs() {
    const now = new Date().toISOString();
    return [
        {
            id: 'sample-1',
            title: 'API Integration Guide',
            category: 'guide',
            tags: ['api', 'integration'],
            content: '# API Integration Guide\n\nThis guide covers how to integrate external APIs into your agent workflows.\n\n## Prerequisites\n- API key configuration\n- Network access\n\n## Steps\n1. Add the API key in Resource Management\n2. Configure the endpoint in your agent skill\n3. Test the integration\n\n## Best Practices\n- Always secure your API keys\n- Use environment variables\n- Implement rate limiting',
            created_at: now,
            updated_at: now,
        },
        {
            id: 'sample-2',
            title: 'Weekly Agent Performance Report',
            category: 'report',
            tags: ['performance', 'weekly'],
            content: '# Weekly Performance Report\n\n## Summary\n- Total conversations: 47\n- Average response time: 820ms\n- Tokens used: 234,500\n- Tasks completed: 89\n\n## Top Performing Skills\n1. Code Development (92% satisfaction)\n2. Terminal Master (88% satisfaction)\n\n## Recommendations\n- Increase memory context for long conversations\n- Add more domain-specific knowledge bases',
            created_at: now,
            updated_at: now,
        },
        {
            id: 'sample-3',
            title: 'Quick Reference: Agent Commands',
            category: 'api',
            tags: ['reference', 'commands'],
            content: '# Agent Commands Quick Reference\n\n## Available Commands\n\n### Conversation Management\n- `new` - Start a new conversation\n- `clear` - Clear current context\n- `save` - Save conversation to memory\n\n### Tool Execution\n- `run <tool>` - Execute a specific tool\n- `list` - Show available tools\n\n### Skill Management\n- `skill add <name>` - Add a skill\n- `skill list` - List all skills',
            created_at: now,
            updated_at: now,
        },
    ];
}

function saveDocs() {
    localStorage.setItem('agent_docs', JSON.stringify(docs));
}

function setCategory(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderDocs();
}

function renderDocs() {
    const list = document.getElementById('doc-list');
    const empty = document.getElementById('doc-empty');

    let filtered = docs;
    if (currentCategory !== 'all') {
        filtered = docs.filter(d => d.category === currentCategory);
    }

    if (filtered.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.style.display = 'grid';
    list.innerHTML = filtered.map(d => docCard(d)).join('');
}

function docCard(d) {
    const catConfig = {
        report: { color: '#3B82F6', icon: 'fa-chart-line' },
        guide: { color: '#10B981', icon: 'fa-book' },
        api: { color: '#F59E0B', icon: 'fa-code' },
        note: { color: '#8B5CF6', icon: 'fa-sticky-note' },
    };
    const cfg = catConfig[d.category] || catConfig.note;
    const d2 = new Date(d.updated_at);
    const dateStr = d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const preview = (d.content || '').substring(0, 100).replace(/[#*`]/g, '');

    return `<div style="background:#fff;border:1px solid var(--border-color);border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:10px;cursor:pointer;transition:border-color 0.2s,box-shadow 0.2s;" onclick="viewDoc('${d.id}')" onmouseover="this.style.borderColor='var(--primary)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.borderColor='var(--border-color)';this.style.boxShadow='none'">
        <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;background:${cfg.color}15;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid ${cfg.icon}" style="color:${cfg.color};font-size:14px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:14px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(d.title)}</div>
                <div style="font-size:11px;color:var(--grey);">${dateStr}</div>
            </div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escHtml(preview)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;">
            ${(d.tags || []).map(t => `<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:var(--light-grey-bg);color:var(--grey);">${escHtml(t)}</span>`).join('')}
            <div style="margin-left:auto;display:flex;gap:4px;">
                <button onclick="event.stopPropagation();editDoc('${d.id}')" style="padding:3px 6px;border:1px solid var(--border-color);border-radius:4px;background:#fff;cursor:pointer;font-size:11px;color:var(--grey);"><i class="fa-solid fa-pen"></i></button>
                <button onclick="event.stopPropagation();deleteDoc('${d.id}')" style="padding:3px 6px;border:1px solid var(--border-color);border-radius:4px;background:#fff;cursor:pointer;font-size:11px;color:#EF4444;"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    </div>`;
}

function showCreateDialog() {
    editingId = null;
    document.getElementById('doc-dialog-title').textContent = 'Create Document';
    document.getElementById('doc-title').value = '';
    document.getElementById('doc-category').value = 'note';
    document.getElementById('doc-tags').value = '';
    document.getElementById('doc-content').value = '';
    document.getElementById('doc-dialog').style.display = 'flex';
}

function editDoc(id) {
    const d = docs.find(d => d.id === id);
    if (!d) return;
    editingId = id;
    document.getElementById('doc-dialog-title').textContent = 'Edit Document';
    document.getElementById('doc-title').value = d.title;
    document.getElementById('doc-category').value = d.category;
    document.getElementById('doc-tags').value = (d.tags || []).join(', ');
    document.getElementById('doc-content').value = d.content;
    document.getElementById('doc-dialog').style.display = 'flex';
}

function closeDocDialog() {
    document.getElementById('doc-dialog').style.display = 'none';
    editingId = null;
}

function saveDoc() {
    const title = document.getElementById('doc-title').value.trim();
    const category = document.getElementById('doc-category').value;
    const tags = document.getElementById('doc-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const content = document.getElementById('doc-content').value.trim();

    if (!title) { alert('Title is required'); return; }
    if (!content) { alert('Content is required'); return; }

    const now = new Date().toISOString();
    if (editingId) {
        const d = docs.find(d => d.id === editingId);
        if (d) { d.title = title; d.category = category; d.tags = tags; d.content = content; d.updated_at = now; }
    } else {
        docs.unshift({
            id: 'doc-' + Date.now(),
            title, category, tags, content,
            created_at: now,
            updated_at: now,
        });
    }
    saveDocs();
    closeDocDialog();
    renderDocs();
}

function deleteDoc(id) {
    if (!confirm('Delete this document?')) return;
    docs = docs.filter(d => d.id !== id);
    saveDocs();
    renderDocs();
}

function viewDoc(id) {
    const d = docs.find(d => d.id === id);
    if (!d) return;
    const catConfig = {
        report: '#3B82F6', guide: '#10B981', api: '#F59E0B', note: '#8B5CF6',
    };
    const color = catConfig[d.category] || '#6B7280';
    document.getElementById('view-title').textContent = d.title;
    document.getElementById('view-content').innerHTML = `<div style="margin-bottom:8px;"><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${color}15;color:${color};font-weight:500;">${d.category}</span></div><div style="white-space:pre-wrap;">${renderMarkdown(escHtml(d.content))}</div>`;
    document.getElementById('view-dialog').style.display = 'flex';
}

function closeViewDialog() {
    document.getElementById('view-dialog').style.display = 'none';
}

function renderMarkdown(text) {
    return text
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:#F3F4F6;padding:1px 4px;border-radius:3px;font-family:monospace;">$1</code>')
        .replace(/\n/g, '<br>');
}

function escHtml(t) {
    if (!t) return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
