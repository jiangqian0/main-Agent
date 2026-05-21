/**
 * chat-storage.js — Conversation persistence module (Backend API version)
 * 负责：加载/保存对话、历史渲染、搜索、固定、导出/导入
 */

let conversations = [];
let historySearchQuery = '';
let historyFilter = 'all';

function getAuthHeaders() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    if (session) {
        const sessionData = JSON.parse(session);
        return {
            'Authorization': `Bearer ${sessionData.token}`,
            'Content-Type': 'application/json'
        };
    }
    return { 'Content-Type': 'application/json' };
}

async function loadConversations() {
    const list = document.getElementById('history-list');
    if (list) {
        list.innerHTML = '<div class="history-loading" style="padding:16px;text-align:center"><p style="font-size:13px;color:#9ca3af;margin:0"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p></div>';
    }

    try {
        const response = await fetch('/api/conversations', {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.navigateTo('/login');
                return;
            }
            throw new Error('Failed to load conversations');
        }

        conversations = await response.json();
    } catch (e) {
        console.error('Failed to load conversations:', e);
        conversations = [];
    }

    if (typeof renderHistory === 'function') {
        renderHistory('');
    }
}

async function saveConversations() {
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function renderHistory(query = '') {
    historySearchQuery = query;
    const list = document.getElementById('history-list');
    if (!list) return;

    let sorted = [...conversations].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

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

        const savedConvId = localStorage.getItem('last_conversation_id');
        const isActive = savedConvId && String(conv.id) === savedConvId;
        const userMsg = conv.messages && conv.messages.length > 0
            ? conv.messages.find(m => m.role === 'user')
            : null;
        const preview = userMsg
            ? userMsg.content.slice(0, 50) + (userMsg.content.length > 50 ? '…' : '')
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

async function togglePinConversation(convId) {
    const conv = conversations.find(c => String(c.id) === String(convId));
    if (!conv) return;
    const newPinned = !conv.pinned;

    try {
        const response = await fetch(`/api/conversations/${convId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ pinned: newPinned })
        });

        if (!response.ok) throw new Error('Failed to update');

        conv.pinned = newPinned;
        conv.updated_at = new Date().toISOString();
        renderHistory(historySearchQuery);
        showToast(newPinned ? 'Conversation pinned' : 'Conversation unpinned', 'info');
    } catch (e) {
        showToast('Failed to update conversation', 'error');
    }
}

function storageExportConversation(convId) {
    const conv = conversations.find(c => String(c.id) === String(convId));
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
        reader.onload = async (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                const list = Array.isArray(imported) ? imported : [imported];
                let added = 0;
                for (const conv of list) {
                    try {
                        const response = await fetch('/api/conversations', {
                            method: 'POST',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({
                                title: conv.title || 'Imported conversation'
                            })
                        });
                        if (response.ok) {
                            added++;
                        }
                    } catch (e) {
                        console.error('Failed to import conversation:', e);
                    }
                }
                await loadConversations();
                showToast(`Imported ${added} conversation(s)`, 'success');
            } catch (err) {
                showToast('Invalid file format', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

async function storageLoadConversation(convId) {
    try {
        const response = await fetch(`/api/conversations/${convId}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.navigateTo('/login');
                return;
            }
            throw new Error('Failed to load conversation');
        }

        const conv = await response.json();

        // 确保 conversations 数组中有这个会话
        const convIdStr = String(convId);
        const existingIdx = conversations.findIndex(c => String(c.id) === convIdStr);
        console.log('[storageLoadConversation] convIdStr:', convIdStr, 'existingIdx:', existingIdx, 'conversations count:', conversations.length);
        
        if (existingIdx >= 0) {
            // 会话已存在，只更新数据（不重复添加）
            conversations[existingIdx] = { ...conversations[existingIdx], ...conv };
            console.log('[storageLoadConversation] updated existing conversation at index', existingIdx);
        } else {
            // 会话不存在，添加到数组
            conversations.unshift(conv);
            console.log('[storageLoadConversation] added new conversation, now count:', conversations.length);
        }

        window.currentConversationId = String(conv.id);
        localStorage.setItem('last_conversation_id', convIdStr);
        console.log('[storageLoadConversation] restored conversation:', convId, 'title:', conv.title);
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
    } catch (e) {
        showToast('Failed to load conversation', 'error');
    }
}

async function storageDeleteConversation(convId) {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;

    try {
        const response = await fetch(`/api/conversations/${convId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to delete');

        conversations = conversations.filter(c => c.id !== convId && String(c.id) !== String(convId));
        if (window.currentConversationId === convId || String(window.currentConversationId) === String(convId)) {
            window.currentConversationId = null;
            clearChat(false);
        }
        renderHistory(historySearchQuery);
        showToast('Conversation deleted', 'info');
    } catch (e) {
        showToast('Failed to delete conversation', 'error');
    }
}

async function storageRenameConversation(convId) {
    const conv = conversations.find(c => String(c.id) === String(convId));
    if (!conv) return;
    const newTitle = prompt('Enter new name:', conv.title || '');
    if (newTitle !== null && newTitle.trim()) {
        try {
            const response = await fetch(`/api/conversations/${convId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ title: newTitle.trim() })
            });

            if (!response.ok) throw new Error('Failed to rename');

            conv.title = newTitle.trim();
            conv.updated_at = new Date().toISOString();
            renderHistory(historySearchQuery);
        } catch (e) {
            showToast('Failed to rename conversation', 'error');
        }
    }
}

async function storageCreateConversation(title) {
    try {
        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ title })
        });

        if (!response.ok) throw new Error('Failed to create conversation');

        const newConv = await response.json();
        conversations.unshift(newConv);
        renderHistory(historySearchQuery);
        localStorage.setItem('last_conversation_id', String(newConv.id));
        return newConv;
    } catch (e) {
        showToast('Failed to create conversation', 'error');
        return null;
    }
}

async function ensureConversation(firstMessage) {
    if (window.currentConversationId) return;
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    const conv = await storageCreateConversation(title);
    if (conv) {
        window.currentConversationId = String(conv.id);
        localStorage.setItem('last_conversation_id', String(conv.id));
    }
}

function getCurrentConversation() {
    const savedConvId = localStorage.getItem('last_conversation_id');
    return conversations.find(c => String(c.id) === savedConvId);
}

async function persistUserMessage(content) {
    let conv = getCurrentConversation();
    console.log('[persistUserMessage] currentConversationId:', window.currentConversationId, 'conv:', conv ? conv.id : 'null');
    
    // 如果没有当前对话，自动创建一个
    if (!conv) {
        console.log('[persistUserMessage] No current conversation, creating one...');
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        conv = await storageCreateConversation(title);
    if (conv) {
        window.currentConversationId = String(conv.id);
        localStorage.setItem('last_conversation_id', String(conv.id));
        console.log('[persistUserMessage] Created new conversation:', conv.id);
    }
    }
    
    if (!conv) {
        console.error('[persistUserMessage] Failed to get or create conversation');
        return;
    }

    try {
        const response = await fetch(`/api/conversations/${conv.id}/messages`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ role: 'user', content })
        });

        if (response.ok) {
            const msg = await response.json();
            conv.messages = conv.messages || [];
            conv.messages.push(msg);
            conv.updated_at = new Date().toISOString();
        } else {
            const error = await response.text();
            console.error('[persistUserMessage] Failed:', response.status, error);
        }
    } catch (e) {
        console.error('[persistUserMessage] Exception:', e);
    }
}

async function persistAssistantMessage(content) {
    let conv = getCurrentConversation();
    
    // 如果没有当前对话，自动创建一个
    if (!conv) {
        console.log('[persistAssistantMessage] No current conversation, creating one...');
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        conv = await storageCreateConversation(title);
        if (conv) {
            window.currentConversationId = String(conv.id);
            localStorage.setItem('last_conversation_id', String(conv.id));
        }
    }
    
    if (!conv) {
        console.error('[persistAssistantMessage] Failed to get or create conversation');
        return;
    }

    try {
        const response = await fetch(`/api/conversations/${conv.id}/messages`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ role: 'assistant', content })
        });

        if (response.ok) {
            const msg = await response.json();
            conv.messages = conv.messages || [];
            conv.messages.push(msg);
            conv.updated_at = new Date().toISOString();
        } else {
            const error = await response.text();
            console.error('[persistAssistantMessage] Failed:', response.status, error);
        }
    } catch (e) {
        console.error('[persistAssistantMessage] Exception:', e);
    }
}

async function deleteMessage(msgId) {
    const conv = getCurrentConversation();
    if (!conv) return;

    try {
        const response = await fetch(`/api/conversations/${conv.id}/messages/${msgId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            conv.messages = conv.messages.filter(m => m.id !== msgId);
        }
    } catch (e) {
        console.error('Failed to delete message:', e);
    }
}
