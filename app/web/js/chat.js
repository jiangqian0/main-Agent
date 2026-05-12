/**
 * chat.js — Chat page entry point
 *
 * Responsibilities kept here:
 *   - Skill dropdown & selection
 *   - Knowledge Base dropdown & selection
 *   - Memory panel
 *   - Workspace file panel
 *   - UI helpers (toast, resize, input)
 *   - Global export aliases for HTML onclick handlers
 *
 * All streaming, storage, and execution logic lives in:
 *   chat-stream.js      — SSE fetch, event routing, DOM rendering
 *   chat-storage.js     — conversation CRUD, localStorage
 *   chat-execution.js   — task steps, logs, tool results
 */

// ─── Module imports (via global) ──────────────────────────────────────────────
// chat-stream.js   → sendMessage, stopStreaming, streamHandleEvent, streamReset,
//                    finalizeStreamState, streamCreateAssistantMessage,
//                    streamRenderThinking, streamToggleThinking, streamRenderText,
//                    streamAppendError, streamRenderCodeStart, streamCodeProgress,
//                    streamCodeEnd, renderMarkdown, escapeHtml, selectedSkillId,
//                    window.selectedKbIds, switchPanel
//
// chat-storage.js  → loadConversations, saveConversations, renderHistory,
//                    storageLoadConversation, storageDeleteConversation,
//                    storageRenameConversation, persistUserMessage,
//                    persistAssistantMessage, ensureConversation, clearChat,
//                    getCurrentConversation, formatDate
//
// chat-execution.js → resetExecutionState, updateStep, addLog, updateToolPanel

// All module functions are already exported via window.* by their respective modules.
// chat-stream.js    → window.sendMessage, window.stopStreaming, etc.
// chat-storage.js   → window.ensureConversation, etc.
// chat-execution.js → window.resetExecutionState, etc.

// Just reference them from window — no destructuring needed (avoids undefined if module didn't load)
window.updateStep        = typeof updateStep !== 'undefined' ? updateStep : () => {};
window.addLog            = typeof addLog !== 'function' ? () => {} : addLog;
window.updateToolPanel   = typeof updateToolPanel !== 'undefined' ? updateToolPanel : () => {};

// Alias storage functions to HTML onclick names
window.loadConversation   = storageLoadConversation;
window.deleteConversation = storageDeleteConversation;
window.renameConversation = storageRenameConversation;

// Alias stream rendering functions
window.toggleThinkingBlock = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const body = el.querySelector('.thinking-body');
  const toggle = el.querySelector('.thinking-toggle');
  const title = el.querySelector('.thinking-header-title');
  if (!body || !toggle) return;
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  toggle.classList.toggle('expanded', hidden);
  if (title) title.textContent = hidden ? 'Thinking' : 'Show thinking';
};

// ─── State (page-specific) ───────────────────────────────────────────────────
let memoryFilter = 'all';
let memoryConfig = { token_threshold: 8000, extract_interval: 5 };
let workspaceFiles = [];
let memories = [];
let selectedMemoryIds = new Set();
let skills = [];
// Use window.selectedSkillId / window.selectedKbIds (defined in chat-storage.js)
// so chat-stream.js can read them without needing module imports
let skillDropdownOpen = false;
let kbDropdownOpen = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadConversations();
  loadMemories();
  loadWorkspaceFiles();
  loadMemoryConfig();
  loadSkills();
  loadKnowledgeEntries();
  initSidebarResize();
  loadModelFromStorage();
  initDropdownCloseHandlers();
});

// ─── Model Selector ───────────────────────────────────────────────────────────
function loadModelFromStorage() {
  const saved = localStorage.getItem('agent_model');
  if (saved) {
    const sel = document.getElementById('model-select');
    if (sel) sel.value = saved;
  }
  document.getElementById('model-select')?.addEventListener('change', e => {
    localStorage.setItem('agent_model', e.target.value);
  });
}

function initDropdownCloseHandlers() {
  document.addEventListener('click', e => {
    if (!e.target.closest('#skill-dropdown-container')) closeSkillDropdown();
    if (!e.target.closest('#kb-dropdown-container')) closeKbDropdown();
  });
}

// ─── Skill Dropdown ──────────────────────────────────────────────────────────
function loadSkills() {
  fetch('/api/skills')
    .then(r => r.ok ? r.json() : [])
    .then(data => {
      skills = Array.isArray(data) ? data : (data.skills || []);
      renderSkillDropdown();
    }).catch(() => { skills = []; renderSkillDropdown(); });
}

function renderSkillDropdown() {
  const list = document.getElementById('skill-dropdown-list');
  if (!list) return;
  const enabled = skills.filter(s => s.enabled);
  list.innerHTML = enabled.map(s => `
    <div class="dropdown-skill-item ${window.selectedSkillId === s.id ? 'active' : ''}" onclick="selectSkill('${s.id}', '${s.name.replace(/'/g, "\\'")}')">
      <i class="${s.icon || 'fa-solid fa-puzzle-piece'}"></i>
      <div class="skill-text">
        <span class="skill-name">${escapeHtml(s.name)}</span>
        <span class="skill-desc">${escapeHtml(s.description || '')}</span>
      </div>
      ${window.selectedSkillId === s.id ? '<i class="fa-solid fa-check skill-check"></i>' : ''}
    </div>`).join('');
}

function toggleSkillDropdown() {
  skillDropdownOpen = !skillDropdownOpen;
  const dd = document.getElementById('skill-dropdown');
  if (dd) dd.classList.toggle('show', skillDropdownOpen);
}

function closeSkillDropdown() {
  skillDropdownOpen = false;
  document.getElementById('skill-dropdown')?.classList.remove('show');
}

function selectSkill(id, name) {
  window.selectedSkillId = id;
  const label = document.getElementById('skill-btn-label');
  if (label) label.textContent = name;
  const btn = document.getElementById('skill-btn');
  if (btn) btn.classList.toggle('active', !!id);
  closeSkillDropdown();
  renderSkillDropdown();
}

// ─── Knowledge Base Dropdown ──────────────────────────────────────────────────
function loadKnowledgeEntries() {
  fetch('/api/knowledge')
    .then(r => r.ok ? r.json() : [])
    .then(data => {
      knowledgeEntries = Array.isArray(data) ? data : (data.entries || []);
      renderKbDropdown();
    }).catch(() => { knowledgeEntries = []; renderKbDropdown(); });
}

function renderKbDropdown() {
  const list = document.getElementById('kb-dropdown-list');
  if (!list) return;
  list.innerHTML = knowledgeEntries.length === 0
    ? '<div class="dropdown-empty">No knowledge bases</div>'
    : knowledgeEntries.map(kb => `
    <div class="dropdown-kb-item ${window.selectedKbIds.has(kb.id) ? 'active' : ''}" onclick="toggleKbEntry('${kb.id}')">
      <i class="fa-solid fa-book"></i>
      <span>${escapeHtml(kb.title)}</span>
      ${window.selectedKbIds.has(kb.id) ? '<i class="fa-solid fa-check kb-check"></i>' : ''}
    </div>`).join('');
}

function toggleKbDropdown() {
  kbDropdownOpen = !kbDropdownOpen;
  const dd = document.getElementById('kb-dropdown');
  if (dd) dd.classList.toggle('show', kbDropdownOpen);
}

function closeKbDropdown() {
  kbDropdownOpen = false;
  document.getElementById('kb-dropdown')?.classList.remove('show');
}

function toggleKbEntry(id) {
  if (window.selectedKbIds.has(id)) {
    window.selectedKbIds.delete(id);
  } else {
    window.selectedKbIds.add(id);
  }
  const label = document.getElementById('kb-btn-label');
  if (label) label.textContent = window.selectedKbIds.size > 0
    ? `Knowledge Base (${window.selectedKbIds.size})`
    : 'Knowledge Base';
  const btn = document.getElementById('kb-btn');
  if (btn) btn.classList.toggle('active', window.selectedKbIds.size > 0);
  renderKbDropdown();
}

// ─── History Toggle ──────────────────────────────────────────────────────────
function toggleHistory() {
  const list = document.getElementById('history-list');
  const icon = document.querySelector('.history-header i');
  if (!list || !icon) return;
  list.classList.toggle('hidden');
  icon.classList.toggle('fa-chevron-down');
  icon.classList.toggle('fa-chevron-up');
}

// ─── New Conversation ─────────────────────────────────────────────────────────
function newConversation() {
  currentConversationId = null;
  clearChat(true);
  window.selectedSkillId = '';
  selectSkill('', 'Auto (Smart)');
  const label = document.getElementById('kb-btn-label');
  if (label) label.textContent = 'Knowledge Base';
  const kbBtn = document.getElementById('kb-btn');
  if (kbBtn) kbBtn.classList.remove('active');
}

// ─── Logout ──────────────────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('agent_session');
  sessionStorage.removeItem('agent_session');
  window.location.href = '/login';
}

// ─── Panel Switching ─────────────────────────────────────────────────────────
function switchPanel(panelName) {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.panel === panelName);
  });
  document.querySelectorAll('.panel-content').forEach(panel => {
    panel.classList.toggle('active', panel.id === panelName + '-panel');
  });
}

// ─── Memory Panel ─────────────────────────────────────────────────────────────
function loadMemories() {
  fetch('/api/memories')
    .then(r => r.ok ? r.json() : [])
    .then(d => {
      memories = Array.isArray(d) ? d : (d.memories || []);
      renderMemories();
    }).catch(() => { memories = []; renderMemories(); });
}

function loadMemoryConfig() {
  try {
    const saved = localStorage.getItem('agent_memory_config');
    if (saved) memoryConfig = JSON.parse(saved);
  } catch (_) {}
}

function renderMemories() {
  const grid = document.getElementById('memory-grid');
  if (!grid) return;
  const filtered = memories.filter(m => {
    if (memoryFilter === 'selected') return selectedMemoryIds.has(m.id);
    return true;
  });
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>No memories found</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map(m => memCard(m)).join('');
}

function memCard(m) {
  const sel = selectedMemoryIds.has(m.id);
  return `<div class="memory-card ${sel ? 'selected' : ''}" onclick="toggleMemorySelection('${m.id}')">
    <div class="memory-card-header"><i class="fa-solid fa-note-sticky"></i></div>
    <div class="memory-card-content">${escapeHtml((m.content || '').slice(0, 200))}</div>
    <div class="memory-card-footer"><span class="memory-card-date">${formatDate(m.created_at)}</span></div>
  </div>`;
}

function toggleMemorySelection(id) {
  if (selectedMemoryIds.has(id)) {
    selectedMemoryIds.delete(id);
  } else {
    selectedMemoryIds.add(id);
  }
  updateSelectionBar();
  renderMemories();
}

function updateSelectionBar() {
  const bar = document.getElementById('memory-selection-bar');
  if (bar) bar.style.display = selectedMemoryIds.size > 0 ? 'flex' : 'none';
}

function setMemoryFilter(f) {
  memoryFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
  renderMemories();
}

function filterMemories() { renderMemories(); }

function showMemorySettings() {
  document.getElementById('memory-settings-dialog')?.classList.add('show');
}
function closeMemorySettings() {
  document.getElementById('memory-settings-dialog')?.classList.remove('show');
}

function saveMemorySettings() {
  const thr = document.getElementById('mem-token-threshold');
  const intr = document.getElementById('mem-interval');
  if (thr) memoryConfig.token_threshold = parseInt(thr.value) || 8000;
  if (intr) memoryConfig.extract_interval = parseInt(intr.value) || 5;
  localStorage.setItem('agent_memory_config', JSON.stringify(memoryConfig));
  closeMemorySettings();
}

function exportMemories() {
  const blob = new Blob([JSON.stringify(memories, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'memories.json'; a.click();
}

function deleteSelectedMemories() {
  if (!confirm(`Delete ${selectedMemoryIds.size} memories?`)) return;
  selectedMemoryIds.forEach(id => {
    if (!id.includes('-')) fetch(`/api/memories/${id}`, { method: 'DELETE' });
  });
  memories = memories.filter(m => !selectedMemoryIds.has(m.id));
  selectedMemoryIds.clear();
  updateSelectionBar();
  renderMemories();
  showToast('Deleted');
}

// ─── Workspace Panel (Tree View) ─────────────────────────────────────────────────
function loadWorkspaceFiles() {
  fetch('/api/workspace/files')
    .then(r => r.ok ? r.json() : [])
    .then(d => { workspaceFiles = Array.isArray(d) ? d : (d.files || []); renderWorkspaceFiles(); })
    .catch(() => { workspaceFiles = []; renderWorkspaceFiles(); });
}

function refreshWorkspacePanel() {
  loadWorkspaceFiles();
}

window.refreshWorkspacePanel = refreshWorkspacePanel;

// Global folder node map for lazy rendering
const _wsAllFolders = {};

function renderWorkspaceFiles() {
  const content = document.getElementById('workspace-content');
  const countEl = document.getElementById('workspace-count');
  if (!content) return;
  if (countEl) countEl.textContent = `(${workspaceFiles.length} files)`;
  if (!workspaceFiles.length) {
    content.innerHTML = `<div class="workspace-empty"><i class="fa-solid fa-folder-open"></i><p>No files yet</p><span>Agent will save files here</span></div>`;
    return;
  }
  const tree = _wsBuildTree(workspaceFiles);
  _wsSortTree(tree);
  content.innerHTML = _wsRenderTree(tree);
}

function _wsBuildTree(files) {
  // Clear folder map
  Object.keys(_wsAllFolders).forEach(k => delete _wsAllFolders[k]);
  const root = { name: '', type: 'root', children: {}, _open: true };
  files.forEach(f => {
    const parts = (f.path || '').replace(/\\/g, '/').split('/').filter(Boolean);
    let cur = root;
    parts.forEach((p, i) => {
      if (!cur.children[p]) {
        const isFile = i === parts.length - 1;
        cur.children[p] = { name: p, type: isFile ? 'file' : 'folder', children: {}, _open: false, path: isFile ? f.path : null };
        if (!isFile) _wsAllFolders[p] = cur.children[p];
      }
      cur = cur.children[p];
    });
  });
  return root;
}

function _wsSortTree(node) {
  const keys = Object.keys(node.children).sort((a, b) => {
    const ca = node.children[a], cb = node.children[b];
    if (ca.type !== cb.type) return ca.type === 'folder' ? -1 : 1;
    return a.localeCompare(b);
  });
  const sorted = {};
  keys.forEach(k => { _wsSortTree(node.children[k]); sorted[k] = node.children[k]; });
  node.children = sorted;
}

function _wsRenderTree(node, depth = 0) {
  const indent = depth * 12;
  let html = '';
  Object.keys(node.children).forEach(key => {
    const child = node.children[key];
    if (child.type === 'file') {
      const icon = _wsGetFileIcon(child.name);
      const escapedPath = escapeHtml(child.path || '');
      const escapedName = escapeHtml(child.name);
      html += `<div class="ws-tree-row" style="padding-left:${indent}px" onclick="wsOpenFile('${escapedPath.replace(/'/g, "\\'")}')">
        <span class="ws-tree-indent"></span>
        <i class="fa-solid ${icon} ws-file-icon"></i>
        <span class="ws-file-name">${escapedName}</span>
        <span class="ws-file-actions">
          <button onclick="event.stopPropagation();wsDownloadFile('${escapedPath.replace(/'/g, "\\'")}','${escapedName.replace(/'/g, "\\'")}')" title="Download"><i class="fa-solid fa-download"></i></button>
          <button onclick="event.stopPropagation();wsDeleteFile('${escapedPath.replace(/'/g, "\\'")}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </span>
      </div>`;
    } else {
      // Folder — always render collapsed initially; children inserted on demand
      html += `<div class="ws-tree-row ws-folder-row" style="padding-left:${indent}px" onclick="wsToggleFolder(this, '${key}')">
        <span class="ws-tree-indent"></span>
        <i class="fa-solid fa-chevron-right ws-chevron"></i>
        <i class="fa-solid fa-folder ws-folder-icon"></i>
        <span class="ws-folder-name">${escapeHtml(key)}</span>
      </div>`;
    }
  });
  return html;
}

function wsToggleFolder(el, key) {
  const row = el.closest ? el.closest('.ws-tree-row') : el;
  const chevron = row.querySelector('.ws-chevron');
  const icon = row.querySelector('.ws-folder-icon');

  // Find the children container that may already exist
  let sibling = row.nextElementSibling;
  while (sibling && !sibling.classList.contains('ws-tree-children')) {
    sibling = sibling.nextElementSibling;
  }

  if (sibling) {
    // Already opened before — just toggle visibility
    const isOpen = chevron.classList.toggle('open');
    chevron.classList.toggle('fa-chevron-down', isOpen);
    chevron.classList.toggle('fa-chevron-right', !isOpen);
    icon.className = isOpen ? 'fa-solid fa-folder-open ws-folder-icon' : 'fa-solid fa-folder ws-folder-icon';
    sibling.style.display = isOpen ? '' : 'none';
  } else {
    // First open — insert children div dynamically
    const folderNode = _wsAllFolders[key];
    if (!folderNode) return;
    chevron.classList.add('open');
    chevron.classList.remove('fa-chevron-right');
    chevron.classList.add('fa-chevron-down');
    icon.className = 'fa-solid fa-folder-open ws-folder-icon';
    const depth = _wsGetDepth(row);
    const childrenHtml = _wsRenderTree(folderNode, depth);
    const container = document.createElement('div');
    container.className = 'ws-tree-children';
    container.innerHTML = childrenHtml;
    row.after(container);
  }
}

function _wsGetDepth(row) {
  // Count how many .ws-tree-children ancestors this row is inside
  let depth = 0;
  let el = row.previousElementSibling;
  while (el) {
    if (el.classList && el.classList.contains('ws-tree-children')) depth++;
    el = el.previousElementSibling;
  }
  return depth;
}

function wsOpenFile(path) {
  window.open(`/api/workspace/files/${encodeURIComponent(path)}`, '_blank');
}

function wsDownloadFile(path, name) {
  window.open(`/api/workspace/files/${encodeURIComponent(path)}?filename=${encodeURIComponent(name)}`, '_blank');
}

function wsDeleteFile(path) {
  if (!confirm(`Delete ${path}?`)) return;
  fetch(`/api/workspace/files/${encodeURIComponent(path)}`, { method: 'DELETE' })
    .then(r => r.ok ? loadWorkspaceFiles() : alert('Delete failed'))
    .catch(() => alert('Delete failed'));
}

function _wsGetFileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const icons = {
    py: 'fa-brands fa-python', js: 'fa-brands fa-js', ts: 'fa-brands fa-js',
    jsx: 'fa-brands fa-react', tsx: 'fa-brands fa-react',
    html: 'fa-brands fa-html5', css: 'fa-brands fa-css3-alt',
    json: 'fa-solid fa-brackets-curly', md: 'fa-brands fa-markdown',
    yaml: 'fa-solid fa-file-code', yml: 'fa-solid fa-file-code',
    sh: 'fa-solid fa-terminal', bash: 'fa-solid fa-terminal',
    sql: 'fa-solid fa-database', go: 'fa-solid fa-golang',
    rs: 'fa-solid fa-rust', java: 'fa-brands fa-java',
    txt: 'fa-solid fa-file-lines',
  };
  return icons[ext] || 'fa-solid fa-file';
}

function handleUpload(e) {
  const fd = new FormData();
  for (const f of e.target.files) fd.append('files', f);
  fetch('/api/workspace/upload', { method: 'POST', body: fd })
    .then(r => r.ok ? loadWorkspaceFiles() : alert('Upload failed'))
    .catch(() => alert('Upload failed'));
}

// ─── Input Helpers ────────────────────────────────────────────────────────────
function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function handleSubmit(e) { e.preventDefault(); sendMessage(); }

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

// ─── Sidebar Resize ──────────────────────────────────────────────────────────
function initSidebarResize() {
  const handle = document.getElementById('sidebar-resize-handle');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;
  let isR = false;
  handle.addEventListener('mousedown', e => {
    isR = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!isR) return;
    const r = sidebar.getBoundingClientRect();
    const w = e.clientX - r.left;
    if (w >= 200 && w <= 400) sidebar.style.width = w + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isR) {
      isR = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : 'xmark'}"></i>${escapeHtml(msg)}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── Markdown (shared, with collapsible code blocks) ──────────────────────────────
function renderMarkdown(content) {
  if (!content) return '';
  let r = content.replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/g, '');
  r = escapeHtml(r);

  r = r.replace(/^- \[x\]\s*(.+)$/gm, '<li class="task-done"><i class="fa-regular fa-check-square"></i>$1</li>');
  r = r.replace(/^- \[ \]\s*(.+)$/gm, '<li class="task-pending"><i class="fa-regular fa-square"></i>$1</li>');

  // Collapsible code blocks
  r = r.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const displayLang = lang || 'text';
    const safeCode = code.trim();
    const shortCode = safeCode.slice(0, 200);
    const isLong = safeCode.split('\n').length > 10 || safeCode.length > 300;
    const codeContent = isLong
      ? `<div class="code-collapsed-preview">${escapeHtml(shortCode)}<span class="code-ellipsis">...</span></div><pre class="code-collapsed-actual" style="display:none">${escapeHtml(safeCode)}</pre>`
      : `<pre class="code-inline">${escapeHtml(safeCode)}</pre>`;
    const toggleBtn = isLong
      ? `<button class="code-toggle-btn" onclick="toggleCodeBlock(this)"><i class="fa-solid fa-eye"></i> Expand</button>`
      : '';
    const langLabel = displayLang !== 'code' ? `<span class="code-lang-label">${escapeHtml(displayLang)}</span>` : '';
    return `<div class="code-block-collapsible">
  <div class="code-block-collapsible-header">
    <span class="code-block-file-name">${langLabel}</span>
    <div class="code-block-collapsible-actions">${toggleBtn}</div>
  </div>
  <div class="code-block-collapsible-body">${codeContent}</div>
</div>`;
  });

  r = r.replace(/`([^`]+)`/g, '<code>$1</code>');
  r = r.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  r = r.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  r = r.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  r = r.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  r = r.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  r = r.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
  r = r.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  r = r.replace(/_([^_]+)_/g, '<em>$1</em>');
  r = r.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  r = r.replace(/^---$/gm, '<hr>');
  r = r.replace(/^- (.+)$/gm, '<li>$1</li>');
  r = r.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  r = r.replace(/^\d+\.\s+(.+)$/gm, '<li class="ordered">$1</li>');
  r = r.replace(/\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)*)/g, (_, header, body) => {
    const headers = header.split('|').map(h => `<th>${h.trim()}</th>`).join('');
    const rows = body.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c !== undefined && c !== '').map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });
  r = r.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  r = r.replace(/\n\n/g, '</p><p>');
  r = `<p>${r}</p>`;
  r = r.replace(/<p><\/p>/g, '');
  r = r.replace(/<p>(<pre)/g, '$1');
  r = r.replace(/(<\/pre>)<\/p>/g, '$1');
  r = r.replace(/<p>(<h[1-3])/g, '$1');
  r = r.replace(/(<\/h[1-3]>)<\/p>/g, '$1');
  r = r.replace(/<p>(<ul)/g, '$1');
  r = r.replace(/(<\/ul>)<\/p>/g, '$1');
  r = r.replace(/<p>(<blockquote)/g, '$1');
  r = r.replace(/(<\/blockquote>)<\/p>/g, '$1');
  r = r.replace(/<p>(<div class="md-table)/g, '$1');
  r = r.replace(/(<\/div>)<\/p>/g, '$1');
  r = r.replace(/<p>(<hr>)<\/p>/g, '$1');
  return r;
}

function escapeHtml(t) {
  if (!t) return '';
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d), now = new Date(), diff = now - date;
  const days = Math.floor(diff / 86400000);
  if (!days) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
