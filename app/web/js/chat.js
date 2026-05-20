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
window.resetExecutionState = typeof resetExecutionState !== 'undefined' ? resetExecutionState : () => {};

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

// ─── Mode Switching (Agent / Plan / Ask) ─────────────────────────────────────────

const MODE_INFO = {
  agent: { badge: 'Agent', desc: 'Full access — read, write, execute', badgeClass: '' },
  plan:  { badge: 'Plan',  desc: 'Plan first, then execute with your approval',  badgeClass: 'plan' },
  ask:   { badge: 'Ask',   desc: 'Question answering only — no tools or file access', badgeClass: 'ask' },
};

function switchMode(mode) {
  window.currentMode = mode;
  window.planConfirmed = false;
  window.pendingPlanMessage = '';

  // Update tab UI
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  // Update mode badge
  const info = MODE_INFO[mode] || MODE_INFO.agent;
  const badge = document.getElementById('mode-badge');
  const desc  = document.getElementById('mode-desc');
  if (badge) {
    badge.textContent = info.badge;
    badge.className = 'mode-badge' + (info.badgeClass ? ' ' + info.badgeClass : '');
  }
  if (desc) desc.textContent = info.desc;

  // Show/hide Plan mode banner
  const planBanner = document.getElementById('plan-mode-banner');
  if (planBanner) planBanner.classList.toggle('visible', mode === 'plan');

  // Show/hide Ask mode banner
  let askBanner = document.getElementById('ask-mode-banner');
  if (!askBanner) {
    // Inject once
    const planBanner = document.getElementById('plan-mode-banner');
    if (planBanner) {
      askBanner = document.createElement('div');
      askBanner.id = 'ask-mode-banner';
      askBanner.className = 'ask-mode-banner';
      askBanner.innerHTML = '<i class="fa-solid fa-comment"></i><span>Ask Mode — Asking questions, no tools or file operations</span>';
      planBanner.parentNode.insertBefore(askBanner, planBanner.nextSibling);
    }
  }
  if (askBanner) askBanner.classList.toggle('visible', mode === 'ask');

  // Show/hide Plan mode tools notice (tools are disabled)
  let planToolsNotice = document.getElementById('plan-tools-notice');
  if (!planToolsNotice) {
    const toolbar = document.getElementById('input-toolbar');
    if (toolbar) {
      planToolsNotice = document.createElement('div');
      planToolsNotice.id = 'plan-tools-notice';
      planToolsNotice.className = 'mode-tools-notice';
      planToolsNotice.innerHTML = '<i class="fa-solid fa-info-circle"></i> Tools are disabled in Plan mode';
      toolbar.insertAdjacentElement('afterend', planToolsNotice);
    }
  }
  if (planToolsNotice) planToolsNotice.classList.toggle('visible', mode === 'plan');

  // Hide confirm bar on mode switch
  const confirmBar = document.getElementById('plan-confirm-bar');
  if (confirmBar) confirmBar.classList.remove('visible');

  // Persist preference
  localStorage.setItem('agent_mode', mode);
}

function confirmPlan() {
  const confirmBar = document.getElementById('plan-confirm-bar');
  if (confirmBar) confirmBar.classList.remove('visible');

  // 获取 AI 生成的 Plan 内容，追加到用户消息中
  const conv = getCurrentConversation();
  let planContent = '';
  if (conv && conv.messages && conv.messages.length > 0) {
    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg.role === 'assistant') {
      planContent = lastMsg.content;
    }
  }

  // 组合消息：用户原始请求 + Plan 结果 + 附件
  let executeMessage = window.pendingPlanMessage || '';
  if (planContent) {
    executeMessage +=
      '\n\n[以下是 AI 生成的执行计划，请严格按此计划执行，不要偏离：]\n' +
      planContent;
  }
  const attachCtx = getAttachmentContext();
  if (attachCtx) executeMessage += attachCtx;
  if (!executeMessage.trim()) return;

  window.planConfirmed = true;

  // 清空当前助手消息占位，重新执行
  const streamingMsg = document.querySelector('.message.assistant.streaming');
  if (streamingMsg) {
    const msgContent = streamingMsg.querySelector('.message-content');
    if (msgContent) msgContent.innerHTML = '<p><em>Executing plan...</em></p>';
  }

  resetStreamState();
  resetExecutionState();
  execSetStep(1, 'running');
  execSetStep(2, 'running');
  execAddLog('info', 'Executing confirmed plan...');

  const skillId = window.selectedSkillId || '';
  abortController = new AbortController();
  streamFetch(executeMessage, skillId, { mode: 'agent', plan_confirmed: true });
}

function cancelPlanConfirm() {
  const confirmBar = document.getElementById('plan-confirm-bar');
  if (confirmBar) confirmBar.classList.remove('visible');
  window.planConfirmed = false;
  window.pendingPlanMessage = '';
  // 不删除消息，只是停止等待确认
  execAddLog('warning', 'Plan cancelled');
}

function persistPlanMessage() {
  // 保存当前用户消息，供 confirmPlan 使用
  const convId = window.currentConversationId;
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  const msgs_arr = conv.messages;
  if (msgs_arr && msgs_arr.length > 0) {
    const last = msgs_arr[msgs_arr.length - 1];
    if (last.role === 'user') {
      window.pendingPlanMessage = last.content;
    }
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Force sidebar scroll to top so history list is visible
  const sidebarMenu = document.querySelector('.sidebar-menu');
  if (sidebarMenu) sidebarMenu.scrollTop = 0;

  // Load data
  loadConversations();        // loads from localStorage + calls renderHistory('')
  loadMemories();
  loadWorkspaceFiles();
  loadMemoryConfig();
  loadSkills();
  loadKnowledgeEntries();
  loadModelFromStorage();
  initDropdownCloseHandlers();

  // Restore saved mode
  const savedMode = localStorage.getItem('agent_mode');
  if (savedMode && MODE_INFO[savedMode]) switchMode(savedMode);

  // Focus the input textarea
  const input = document.getElementById('chat-input');
  if (input) input.focus();
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
// toggleHistory() is defined in shared-sidebar.js (shared across all pages)
// chat.js does NOT redefine it — do not add a local override here.

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
  for (const f of e.target.files) fd.append('file', f);
  fetch('/api/workspace/upload', { method: 'POST', body: fd })
    .then(r => {
      if (r.ok) {
        loadWorkspaceFiles();
        showToast('File uploaded successfully');
      } else {
        alert('Upload failed');
      }
    })
    .catch(() => alert('Upload failed'));
}

function handleUploadFromButton(e) {
  // Triggered by the attach button — same logic as drag & drop
  const files = Array.from(e.files || []);
  if (files.length) processDroppedFiles(files);
  e.value = ''; // reset so same file can be selected again
}

// ─── File Drag & Drop ────────────────────────────────────────────────────────

let pendingAttachments = []; // { file, name, status }

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone')?.classList.add('active');
}

function handleDragLeave(e) {
  // Only hide if leaving the window
  if (!e.relatedTarget || !document.body.contains(e.relatedTarget)) {
    document.getElementById('drop-zone')?.classList.remove('active');
  }
}

function handleFileDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone')?.classList.remove('active');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) processDroppedFiles(files);
}

function processDroppedFiles(files) {
  files.forEach(file => {
    const id = 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    pendingAttachments.push({ id, file, name: file.name, status: 'pending' });
    renderAttachmentBar();
    uploadAttachment(id, file);
  });
}

function uploadAttachment(id, file) {
  const att = pendingAttachments.find(a => a.id === id);
  if (!att) return;
  att.status = 'uploading';
  renderAttachmentBar();

  const fd = new FormData();
  fd.append('file', file);
  fetch('/api/workspace/upload', { method: 'POST', body: fd })
    .then(r => {
      if (r.ok) {
        att.status = 'done';
        att.uploadedPath = file.name;
        // Refresh workspace panel to show uploaded file
        loadWorkspaceFiles();
      } else {
        att.status = 'error';
        att.error = 'Upload failed';
      }
    })
    .catch(() => { att.status = 'error'; att.error = 'Upload failed'; })
    .finally(() => renderAttachmentBar());
}

function removeAttachment(id) {
  pendingAttachments = pendingAttachments.filter(a => a.id !== id);
  renderAttachmentBar();
}

function clearAttachments() {
  pendingAttachments = [];
  renderAttachmentBar();
}

function renderAttachmentBar() {
  const bar = document.getElementById('attachment-bar');
  const list = document.getElementById('attachment-list');
  if (!bar || !list) return;

  if (pendingAttachments.length === 0) {
    bar.classList.remove('visible');
    return;
  }

  bar.classList.add('visible');
  const icons = {
    pdf: 'fa-solid fa-file-pdf', doc: 'fa-solid fa-file-word', docx: 'fa-solid fa-file-word',
    xls: 'fa-solid fa-file-excel', xlsx: 'fa-solid fa-file-excel',
    zip: 'fa-solid fa-file-zipper', png: 'fa-solid fa-image',
    jpg: 'fa-solid fa-image', jpeg: 'fa-solid fa-image', gif: 'fa-solid fa-image',
    mp3: 'fa-solid fa-file-audio', mp4: 'fa-solid fa-file-video',
    py: 'fa-brands fa-python', js: 'fa-brands fa-js', ts: 'fa-solid fa-code',
    html: 'fa-brands fa-html5', css: 'fa-brands fa-css3-alt', json: 'fa-solid fa-code',
    txt: 'fa-solid fa-file-lines', md: 'fa-solid fa-file-lines',
  };
  const getIcon = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    return icons[ext] || 'fa-solid fa-file';
  };
  const getStatusIcon = (s) => {
    if (s === 'done') return '<i class="fa-solid fa-check-circle" style="color:#10b981"></i>';
    if (s === 'error') return '<i class="fa-solid fa-circle-exclamation" style="color:#ef4444"></i>';
    if (s === 'uploading') return '<i class="fa-solid fa-spinner fa-spin" style="color:#3b82f6"></i>';
    return '<i class="fa-solid fa-clock" style="color:#9ca3af"></i>';
  };

  list.innerHTML = pendingAttachments.map(att => `
    <div class="attachment-chip ${att.status}" id="${att.id}">
      ${getStatusIcon(att.status)}
      <i class="${getIcon(att.name)}"></i>
      <span class="attachment-chip-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
      <button class="attachment-chip-remove" onclick="removeAttachment('${att.id}')">✕</button>
    </div>
  `).join('');
}

function getAttachmentContext() {
  // Returns a string describing attached files for the prompt
  if (!pendingAttachments.length) return '';
  const done = pendingAttachments.filter(a => a.status === 'done');
  if (!done.length) return '';
  const names = done.map(a => a.name).join(', ');
  return `\n[Attached files: ${names}]\n`;
}
window.getAttachmentContext = getAttachmentContext;

// ─── Voice Input ─────────────────────────────────────────────────────────────

let recognition = null;
let voiceIsListening = false;

function toggleVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Your browser does not support voice input', 'error');
    return;
  }
  if (voiceIsListening) {
    stopVoiceInput();
  } else {
    startVoiceInput();
  }
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    voiceIsListening = true;
    updateVoiceBtn(true);
    showToast('Listening... speak now', 'info');
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const input = document.getElementById('chat-input');
    if (input) {
      const prev = input.value.trim();
      input.value = prev ? prev + ' ' + transcript : transcript;
      autoResize(input);
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== 'no-speech') {
      showToast('Voice error: ' + event.error, 'error');
    }
    stopVoiceInput();
  };

  recognition.onend = () => {
    if (voiceIsListening) {
      // Restart if still supposed to be listening
      try { recognition.start(); } catch(e) {}
    }
  };

  recognition.start();
}

function stopVoiceInput() {
  if (recognition) {
    voiceIsListening = false;
    updateVoiceBtn(false);
    try { recognition.stop(); } catch(e) {}
    recognition = null;
  }
}

function updateVoiceBtn(listening) {
  const btn = document.getElementById('voice-btn');
  const icon = document.getElementById('voice-icon');
  if (!btn || !icon) return;
  btn.classList.toggle('recording', listening);
  icon.className = listening ? 'fa-solid fa-stop' : 'fa-solid fa-microphone';
}

// ─── Slash Commands ─────────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { cmd: 'ask',    label: '/ask',    hint: 'Switch to Ask mode', desc: 'Answer questions without executing' },
  { cmd: 'plan',   label: '/plan',   hint: 'Switch to Plan mode', desc: 'Show plan before executing' },
  { cmd: 'agent',  label: '/agent',  hint: 'Switch to Agent mode', desc: 'Full access — read, write, execute' },
  { cmd: 'clear',  label: '/clear',  hint: 'Clear conversation', desc: 'Clear current chat history' },
  { cmd: 'new',    label: '/new',    hint: 'New conversation', desc: 'Start a fresh conversation' },
  { cmd: 'export', label: '/export', hint: 'Export conversation', desc: 'Download current conversation' },
  { cmd: 'model',  label: '/model',  hint: 'Switch model', desc: 'Usage: /model qwen3-max' },
  { cmd: 'help',   label: '/help',   hint: 'Show all commands', desc: 'List all available commands' },
];

let slashMenuEl = null;
let slashActiveIdx = -1;
let slashQuery = '';

function showSlashMenu(input) {
  closeSlashMenu();

  const form = input.closest('.chat-input-form');
  const wrapper = input.closest('.chat-input-wrapper');
  const target = form || wrapper || document.body;

  const targetRect = target.getBoundingClientRect();
  const inputRect = input.getBoundingClientRect();

  // How far the input's bottom is from the target's top edge
  const inputBottomFromTarget = inputRect.bottom - targetRect.top;
  // Menu sits directly above the textarea (inputBottomFromTarget px from target top)
  const menuBottom = inputBottomFromTarget + 6;

  const menu = document.createElement('div');
  menu.id = 'slash-menu';
  menu.style.cssText =
    `position:absolute;bottom:${menuBottom}px;left:0;right:0;` +
    `min-width:320px;max-height:300px;background:#fff;` +
    `border:1px solid #e8e8e8;border-radius:12px;` +
    `box-shadow:0 8px 30px rgba(0,0,0,0.15);` +
    `z-index:999;overflow-y:auto;font-family:Inter,sans-serif;` +
    `animation:slashMenuIn 0.15s ease`;

  menu.innerHTML = SLASH_COMMANDS.map((c, i) =>
    `<div class="slash-item ${i===0?'active':''}" data-cmd="${c.cmd}" data-idx="${i}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-radius:8px;margin:3px 6px">
      <span style="font-size:13px;font-weight:700;color:var(--primary);min-width:64px">${escapeHtml(c.label)}</span>
      <span style="font-size:12px;color:var(--text-secondary);flex:1">${escapeHtml(c.desc)}</span>
    </div>`
  ).join('');

  target.style.position = 'relative';
  target.appendChild(menu);

  menu.addEventListener('mousedown', e => e.preventDefault());
  menu.addEventListener('click', e => {
    const item = e.target.closest('.slash-item');
    if (item) executeSlashCommand(item.dataset.cmd, input);
  });

  slashMenuEl = menu;
  slashActiveIdx = 0;
}

function closeSlashMenu() {
  if (slashMenuEl) { slashMenuEl.remove(); slashMenuEl = null; }
  slashActiveIdx = -1;
}

function updateSlashMenu(query) {
  if (!slashMenuEl) return;
  slashQuery = query;
  const items = slashMenuEl.querySelectorAll('.slash-item');
  if (!query) {
    items.forEach((it, i) => { it.style.display = 'flex'; it.classList.toggle('active', i === 0); });
    slashActiveIdx = 0;
    return;
  }
  const q = query.toLowerCase();
  let first = -1;
  items.forEach((it, i) => {
    const cmd = SLASH_COMMANDS[i];
    const match = cmd.cmd.includes(q) || cmd.label.includes(q) || cmd.desc.toLowerCase().includes(q);
    it.style.display = match ? 'flex' : 'none';
    if (match && first === -1) { first = i; it.classList.add('active'); }
    else it.classList.remove('active');
  });
  if (first !== -1) slashActiveIdx = first;
  else slashActiveIdx = -1;
  const active = slashMenuEl.querySelector('.slash-item.active');
  active?.scrollIntoView({ block: 'nearest' });
}

function executeSlashCommand(cmd, input) {
  closeSlashMenu();
  switch (cmd) {
    case 'ask':
      switchMode('ask');
      showToast('Switched to Ask mode', 'info');
      break;
    case 'plan':
      switchMode('plan');
      showToast('Switched to Plan mode', 'info');
      break;
    case 'agent':
      switchMode('agent');
      showToast('Switched to Agent mode', 'info');
      break;
    case 'clear':
      clearChat(true);
      showToast('Conversation cleared', 'info');
      break;
    case 'new':
      newConversation();
      showToast('New conversation started', 'info');
      break;
    case 'export':
      if (window.currentConversationId) storageExportConversation(window.currentConversationId);
      else showToast('No active conversation', 'error');
      break;
    case 'model':
      const sel = document.getElementById('model-select');
      if (sel) {
        sel.focus();
        showToast('Use dropdown to select model', 'info');
      }
      break;
    case 'help':
      input.value = '';
      showSlashHelp();
      break;
  }
}

function showSlashHelp() {
  const msg = [
    '**Available Commands:**\n',
    ...SLASH_COMMANDS.map(c => `- **${c.label}** — ${c.desc}`),
    '\n_Type any command above in the input box_'
  ].join('\n');
  appendAssistantMessage(msg);
  persistAssistantMessage(msg);
}

function handleKeyDown(e) {
  const input = document.getElementById('chat-input');

  // Slash menu navigation
  if (slashMenuEl) {
    const items = [...slashMenuEl.querySelectorAll('.slash-item')].filter(it => it.style.display !== 'none');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items.forEach(it => it.classList.remove('active'));
      slashActiveIdx = (slashActiveIdx + 1) % items.length;
      if (slashActiveIdx >= items.length) slashActiveIdx = 0;
      items[slashActiveIdx]?.classList.add('active');
      items[slashActiveIdx]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      items.forEach(it => it.classList.remove('active'));
      slashActiveIdx = slashActiveIdx <= 0 ? items.length - 1 : slashActiveIdx - 1;
      items[slashActiveIdx]?.classList.add('active');
      items[slashActiveIdx]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const active = slashMenuEl.querySelector('.slash-item.active');
      if (active) executeSlashCommand(active.dataset.cmd, input);
      return;
    }
    if (e.key === 'Escape') {
      closeSlashMenu();
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function handleSubmit(e) { e.preventDefault(); sendMessage(); }

// autoResize: auto-grows textarea and detects "/" slash commands
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';

  const val = el.value;
  const cursor = el.selectionStart;
  const beforeCursor = val.slice(0, cursor);
  const slashMatch = beforeCursor.match(/(?:^|\s)\/(\w*)$/);
  if (slashMatch) {
    if (!slashMenuEl) showSlashMenu(el);
    updateSlashMenu(slashMatch[1]);
  } else {
    closeSlashMenu();
  }
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

// ─── Profile Popover ───────────────────────────────────────────────────────────

const ANSWER_STYLES = {
  concise: {
    name: 'Concise',
    prompt_suffix: '\n\n**Reply Style**: Be concise and direct. Lead with the answer, code-first. Only elaborate when asked.',
  },
  detailed: {
    name: 'Detailed',
    prompt_suffix: '\n\n**Reply Style**: Give thorough explanations with full context. Include background, trade-offs, and alternatives.',
  },
  academic: {
    name: 'Academic',
    prompt_suffix: '\n\n**Reply Style**: Be structured and formal. Use precise terminology, cite sources when possible, and analyze from multiple angles.',
  },
  creative: {
    name: 'Creative',
    prompt_suffix: '\n\n**Reply Style**: Be flexible and innovative. Explore unconventional approaches and suggest creative solutions.',
  },
};

let profilePopoverOpen = false;

function toggleProfilePopover(e) {
  if (e) e.stopPropagation();
  profilePopoverOpen = !profilePopoverOpen;
  const popover = document.getElementById('profile-popover');
  if (!popover) return;
  popover.style.display = profilePopoverOpen ? 'block' : 'none';

  if (profilePopoverOpen) {
    // Populate user info
    const username = localStorage.getItem('agent_username') || 'User';
    const email = localStorage.getItem('agent_email') || 'user@example.com';
    const el = document.getElementById('popover-username');
    const em = document.getElementById('popover-email');
    if (el) el.textContent = username;
    if (em) em.textContent = email;

    // Sync style checkmark
    const saved = localStorage.getItem('agent_answer_style') || 'concise';
    document.querySelectorAll('.style-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.style === saved);
    });
  }
}

function selectAnswerStyle(style) {
  localStorage.setItem('agent_answer_style', style);
  document.querySelectorAll('.style-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.style === style);
  });
  // Persist to server config
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer_style: style }),
  }).catch(() => {});
  showToast(`Answer style: ${ANSWER_STYLES[style]?.name || style}`, 'info');
}

function getAnswerStyleSuffix() {
  const style = localStorage.getItem('agent_answer_style') || 'concise';
  return ANSWER_STYLES[style]?.prompt_suffix || ANSWER_STYLES.concise.prompt_suffix;
}

window.toggleProfilePopover = toggleProfilePopover;
window.selectAnswerStyle = selectAnswerStyle;
window.getAnswerStyleSuffix = getAnswerStyleSuffix;

// Close popover when clicking outside
const _origInitDropdownClose = typeof initDropdownCloseHandlers !== 'undefined' ? initDropdownCloseHandlers : null;
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    if (profilePopoverOpen && !e.target.closest('#profile-popover') && !e.target.closest('#profile-btn')) {
      profilePopoverOpen = false;
      const popover = document.getElementById('profile-popover');
      if (popover) popover.style.display = 'none';
    }
    if (!e.target.closest('#skill-dropdown-container')) closeSkillDropdown();
    if (!e.target.closest('#kb-dropdown-container')) closeKbDropdown();
  });
});
