/**
 * chat-storage.js — Conversation persistence module
 * 负责：加载/保存对话、加载历史、生成ID
 */

let conversations = [];
let currentConversationId = null;

// ─── Load / Save ─────────────────────────────────────────────────────────────

function loadConversations() {
  try {
    const stored = localStorage.getItem('agent_conversations');
    conversations = stored ? JSON.parse(stored) : [];
  } catch (e) {
    conversations = [];
  }
  renderHistory();
}

function saveConversations() {
  try {
    localStorage.setItem('agent_conversations', JSON.stringify(conversations));
  } catch (e) {
    console.warn('Failed to save conversations', e);
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── History Rendering ───────────────────────────────────────────────────────

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  if (conversations.length === 0) {
    list.innerHTML = '<div class="history-empty">No conversations yet</div>';
    return;
  }

  list.innerHTML = conversations.map(conv => {
    const isActive = conv.id === currentConversationId;
    const lastMsg = conv.messages && conv.messages.length > 0
      ? conv.messages[conv.messages.length - 1]
      : null;
    const preview = lastMsg
      ? (lastMsg.role === 'user' ? lastMsg.content : lastMsg.content).slice(0, 40) + (lastMsg.content.length > 40 ? '...' : '')
      : conv.title || 'Untitled';

    return `
    <div class="history-item ${isActive ? 'active' : ''}" data-id="${conv.id}">
      <div class="history-item-main" onclick="storageLoadConversation('${conv.id}')">
        <i class="fa-solid fa-comment-dots"></i>
        <div class="history-item-content">
          <div class="history-item-title">${escapeHtml(conv.title || 'Untitled')}</div>
          <div class="history-item-date">${preview}</div>
        </div>
      </div>
      <div class="history-item-actions">
        <button onclick="event.stopPropagation();storageRenameConversation('${conv.id}')" title="Rename">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button onclick="event.stopPropagation();storageDeleteConversation('${conv.id}')" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

// ─── Conversation CRUD ───────────────────────────────────────────────────────

function storageLoadConversation(convId) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  currentConversationId = convId;
  renderHistory();

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
  if (!confirm('Delete this conversation?')) return;
  conversations = conversations.filter(c => c.id !== convId);
  if (currentConversationId === convId) {
    currentConversationId = null;
    clearChat(false);
  }
  saveConversations();
  renderHistory();
}

function storageRenameConversation(convId) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  const newTitle = prompt('Enter new name:', conv.title || '');
  if (newTitle !== null && newTitle.trim()) {
    conv.title = newTitle.trim();
    conv.updated_at = new Date().toISOString();
    saveConversations();
    renderHistory();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentConversation() {
  return conversations.find(c => c.id === currentConversationId);
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
  if (!currentConversationId) {
    currentConversationId = generateId();
    conversations.unshift({
      id: currentConversationId,
      title: msg.slice(0, 50) + (msg.length > 50 ? '...' : ''),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: []
    });
    saveConversations();
    renderHistory();
  }
}

function clearChat(clearId = true) {
  const container = document.getElementById('chat-container');
  if (!container) return;
  container.innerHTML = `<div class="welcome-message" id="welcome-message">
    <div class="welcome-icon"><i class="fa-solid fa-robot"></i></div>
    <h2>AliCloud Agent Hub</h2>
    <p>Start a conversation to get help with your tasks</p>
  </div>`;
  if (clearId) {
    currentConversationId = null;
    renderHistory();
  }
  window.resetExecutionState();
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
window.loadConversations           = loadConversations;
window.saveConversations           = saveConversations;
window.renderHistory               = renderHistory;
window.storageLoadConversation      = storageLoadConversation;
window.storageDeleteConversation   = storageDeleteConversation;
window.storageRenameConversation   = storageRenameConversation;
window.persistUserMessage          = persistUserMessage;
window.persistAssistantMessage     = persistAssistantMessage;
window.ensureConversation          = ensureConversation;
window.getCurrentConversation      = getCurrentConversation;
window.clearChat                  = clearChat;
window.escapeHtml                  = escapeHtml;
window.formatDate                  = formatDate;
window.currentConversationId       = null;
