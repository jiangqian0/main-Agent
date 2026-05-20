/**
 * chat-storage.js — Conversation persistence module
 * 负责：加载/保存对话、历史渲染、搜索、固定、导出/导入
 */

let conversations = [];
let historySearchQuery = '';
let historyFilter = 'all'; // 'all' | 'pinned' | 'recent'

// ─── Load / Save ─────────────────────────────────────────────────────────────

function loadConversations() {
  const list = document.getElementById('history-list');
  if (list) {
    list.innerHTML = '<div class="history-loading" style="padding:16px;text-align:center"><p style="font-size:13px;color:#9ca3af;margin:0"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p></div>';
  }
  try {
    const stored = localStorage.getItem('agent_conversations');
    conversations = stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to load conversations:', e);
    conversations = [];
  }
  if (typeof renderHistory === 'function') {
    renderHistory('');
  }
}

function saveConversations() {
  try {
    localStorage.setItem('agent_conversations', JSON.stringify(conversations));
  } catch (e) {
    showToast('Failed to save — storage may be full', 'error');
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── History Rendering ───────────────────────────────────────────────────────

function renderHistory(query = '') {
  historySearchQuery = query;
  const list = document.getElementById('history-list');
  if (!list) return;

  // Filter: pinned first, then by date
  let sorted = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
  });

  // Filter by search query
  if (query) {
    const q = query.toLowerCase();
    sorted = sorted.filter(conv => {
      const titleMatch = (conv.title || '').toLowerCase().includes(q);
      const msgMatch = (conv.messages || []).some(m =>
        (m.content || '').toLowerCase().includes(q)
      );
      return titleMatch || msgMatch;
    });
  }

  if (sorted.length === 0) {
    list.innerHTML = `<div class="history-empty" style="padding:16px;text-align:center">
      <p style="font-size:13px;color:#9ca3af;margin:0">${query ? 'No results for "' + escapeHtml(query) + '"' : 'No conversations yet'}</p>
    </div>`;
    updateHistoryCount();
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const thisWeek = new Date(today); thisWeek.setDate(today.getDate() - 7);

  let currentGroupLabel = '';
  list.innerHTML = sorted.map(conv => {
    const updatedAt = conv.updated_at ? new Date(conv.updated_at) : new Date(0);
    let groupLabel = '';
    if (updatedAt >= today) groupLabel = 'Today';
    else if (updatedAt >= yesterday) groupLabel = 'Yesterday';
    else if (updatedAt >= thisWeek) groupLabel = 'This Week';
    else groupLabel = 'Older';

    const groupTag = (groupLabel !== currentGroupLabel) ? (currentGroupLabel = groupLabel, `<div class="history-group-label">${groupLabel}</div>`) : '';

    const isActive = conv.id === window.currentConversationId;
    const lastMsg = conv.messages && conv.messages.length > 0
      ? conv.messages[conv.messages.length - 1]
      : null;
    const preview = lastMsg
      ? lastMsg.content.slice(0, 50) + (lastMsg.content.length > 50 ? '…' : '')
      : conv.title || 'Untitled';
    const timeAgo = formatDate(conv.updated_at);

    return `${groupTag}
    <div class="history-item ${isActive ? 'active' : ''} ${conv.pinned ? 'pinned' : ''}" data-id="${conv.id}">
      ${conv.pinned ? '<div class="history-item-pin" title="Pinned"><i class="fa-solid fa-thumbtack"></i></div>' : ''}
      <div class="history-item-main" onclick="storageLoadConversation('${conv.id}')">
        <i class="fa-solid fa-comment-dots"></i>
        <div class="history-item-content">
          <div class="history-item-title">${escapeHtml(conv.title || 'Untitled')}</div>
          <div class="history-item-date">${escapeHtml(preview)}</div>
        </div>
      </div>
      <div class="history-item-actions">
        <button onclick="event.stopPropagation();togglePinConversation('${conv.id}')" title="${conv.pinned ? 'Unpin' : 'Pin'}">
          <i class="fa-solid ${conv.pinned ? 'fa-thumbtack' : 'fa-thumbtack'}"></i>
        </button>
        <button onclick="event.stopPropagation();storageExportConversation('${conv.id}')" title="Export">
          <i class="fa-solid fa-download"></i>
        </button>
        <button onclick="event.stopPropagation();storageRenameConversation('${conv.id}')" title="Rename">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button onclick="event.stopPropagation();storageDeleteConversation('${conv.id}')" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');

  updateHistoryCount();
}

function updateHistoryCount() {
  const countEl = document.getElementById('history-count');
  if (countEl) countEl.textContent = `${conversations.length} conversations`;
}

function onHistorySearchInput(el) {
  renderHistory(el ? el.value.trim() : '');
}

// ─── Pin / Unpin ─────────────────────────────────────────────────────────────

function togglePinConversation(convId) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  conv.pinned = !conv.pinned;
  conv.updated_at = new Date().toISOString();
  saveConversations();
  renderHistory(historySearchQuery);
  showToast(conv.pinned ? 'Conversation pinned' : 'Conversation unpinned', 'info');
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function storageExportConversation(convId) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  const data = JSON.stringify(conv, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conversation_${conv.title || 'untitled'}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Conversation exported', 'success');
}

function storageExportAll() {
  if (!conversations.length) {
    showToast('No conversations to export', 'error');
    return;
  }
  const data = JSON.stringify(conversations, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent_conversations_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${conversations.length} conversations`, 'success');
}

function storageImportFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        const list = Array.isArray(imported) ? imported : [imported];
        let added = 0;
        for (const conv of list) {
          if (!conv.id) conv.id = generateId();
          if (!conv.title) conv.title = 'Imported conversation';
          if (!conv.created_at) conv.created_at = new Date().toISOString();
          if (!conv.updated_at) conv.updated_at = new Date().toISOString();
          if (!conv.messages) conv.messages = [];
          const exists = conversations.find(c => c.id === conv.id);
          if (!exists) {
            conversations.push(conv);
            added++;
          }
        }
        saveConversations();
        renderHistory(historySearchQuery);
        showToast(`Imported ${added} conversation(s)`, 'success');
      } catch (err) {
        showToast('Invalid file format', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── Conversation CRUD ───────────────────────────────────────────────────────

function storageLoadConversation(convId) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  window.currentConversationId = convId;
  renderHistory(historySearchQuery);

  const container = document.getElementById('chat-container');
  if (!container) return;

  container.innerHTML = '';
  const msgs = conv.messages || [];

  if (msgs.length === 0) {
    container.innerHTML = `<div class="welcome-message" id="welcome-message">
      <div class="welcome-icon"><i class="fa-solid fa-robot"></i></div>
      <h2>${escapeHtml(conv.title || 'Untitled')}</h2>
      <p>Start a new conversation or continue from here</p>
    </div>`;
    return;
  }

  for (const msg of msgs) {
    if (msg.role === 'user') {
      appendUserMessage(msg.content, false);
    } else if (msg.role === 'assistant') {
      appendAssistantMessage(msg.content, false);
    }
  }
  container.scrollTop = container.scrollHeight;
}

function storageDeleteConversation(convId) {
  if (!confirm('Delete this conversation? This cannot be undone.')) return;
  conversations = conversations.filter(c => c.id !== convId);
  if (window.currentConversationId === convId) {
    window.currentConversationId = null;
    clearChat(false);
  }
  saveConversations();
  renderHistory(historySearchQuery);
  showToast('Conversation deleted', 'info');
}

function storageRenameConversation(convId) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  const newTitle = prompt('Enter new name:', conv.title || '');
  if (newTitle !== null && newTitle.trim()) {
    conv.title = newTitle.trim();
    conv.updated_at = new Date().toISOString();
    saveConversations();
    renderHistory(historySearchQuery);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentConversation() {
  return conversations.find(c => c.id === window.currentConversationId);
}

function persistUserMessage(content) {
  const conv = getCurrentConversation();
  if (!conv) return;
  conv.messages = conv.messages || [];
  conv.messages.push({ role: 'user', content });
  conv.updated_at = new Date().toISOString();
  saveConversations();
}

function persistAssistantMessage(content) {
  const conv = getCurrentConversation();
  if (!conv) return;
  conv.messages = conv.messages || [];
  conv.messages.push({ role: 'assistant', content });
  conv.updated_at = new Date().toISOString();
  saveConversations();
}

function ensureConversation(msg) {
  if (!window.currentConversationId) {
    window.currentConversationId = generateId();
    conversations.unshift({
      id: window.currentConversationId,
      title: msg.slice(0, 50) + (msg.length > 50 ? '…' : ''),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: []
    });
    saveConversations();
    renderHistory(historySearchQuery);
  }
}

function clearChat(clearId = true) {
  const container = document.getElementById('chat-container');
  if (!container) return;

  if (clearId) {
    window.currentConversationId = null;
  }

  // Only show welcome message when there is no active conversation
  const hasActiveConv = !clearId && window.currentConversationId;
  if (hasActiveConv) {
    // Reload the conversation messages
    const conv = conversations.find(c => c.id === window.currentConversationId);
    if (conv) {
      container.innerHTML = '';
      const msgs = conv.messages || [];
      for (const msg of msgs) {
        if (msg.role === 'user') {
          appendUserMessage(msg.content, false);
        } else if (msg.role === 'assistant') {
          appendAssistantMessage(msg.content, false);
        }
      }
      container.scrollTop = container.scrollHeight;
    } else {
      container.innerHTML = _welcomeHtml();
    }
  } else {
    container.innerHTML = _welcomeHtml();
    renderHistory(historySearchQuery);
  }

  window.resetExecutionState();
}

function _welcomeHtml() {
  return `<div class="welcome-message" id="welcome-message">
    <div class="welcome-icon"><i class="fa-solid fa-robot"></i></div>
    <h2>AliCloud Agent Hub</h2>
    <p>Start a conversation to get help with your tasks</p>
  </div>`;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

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

// ─── Window Exports ─────────────────────────────────────────────────────────────
window.loadConversations             = loadConversations;
window.saveConversations             = saveConversations;
window.renderHistory                = renderHistory;
window.storageLoadConversation      = storageLoadConversation;
window.storageDeleteConversation    = storageDeleteConversation;
window.storageRenameConversation    = storageRenameConversation;
window.togglePinConversation        = togglePinConversation;
window.storageExportConversation    = storageExportConversation;
window.storageExportAll             = storageExportAll;
window.storageImportFromFile        = storageImportFromFile;
window.persistUserMessage           = persistUserMessage;
window.persistAssistantMessage      = persistAssistantMessage;
window.ensureConversation           = ensureConversation;
window.getCurrentConversation       = getCurrentConversation;
window.clearChat                   = clearChat;
window.escapeHtml                   = escapeHtml;
window.formatDate                   = formatDate;
window.onHistorySearchInput         = onHistorySearchInput;
window.currentConversationId        = null;
