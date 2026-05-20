// ========================================
// Alicloud Agent - Main Application
// ========================================

const API_BASE_URL = '/api';

// State
let abortController = null;
let isStreaming = false;
let currentConversationId = null;
let conversations = [];
let skills = [];
let selectedKbs = [];
let selectedSkill = '';

// Sidebar State
let sidebarWidth = 260;
let isDragging = false;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 400;

// Tooltip for thinking step states
const KNOWLEDGE_BASES = [
    { id: 'kb1', name: 'Operation Manual' },
    { id: 'kb2', name: 'Security Standards' },
    { id: 'kb3', name: 'Architecture Docs' },
];

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initMenuNavigation();
    loadSettings();
    loadSkills();
    loadConversations();
});

// ========================================
// Sidebar Resize
// ========================================

function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('sidebar-resize-handle');

    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX));
        sidebar.style.width = newWidth + 'px';
        sidebarWidth = newWidth;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// ========================================
// Menu Navigation
// ========================================

function initMenuNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.dataset.view;
            switchView(viewId);
        });
    });
}

function switchView(viewId) {
    // Update menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewId);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === viewId + '-view');
    });

    // Load view-specific data
    if (viewId === 'chat') {
        // Chat view is always ready
    } else if (viewId === 'skills') {
        loadSkillsPage();
    } else if (viewId === 'workspace') {
        loadWorkspace();
    } else if (viewId === 'settings') {
        // Settings view is always ready
    } else if (viewId) {
        showGenericView(viewId);
    }
}

// ========================================
// Generic View (for future pages)
// ========================================

function showGenericView(viewId) {
    const titles = {
        'fc': 'Function Compute',
        'resources': 'Resource Management',
        'deploy': 'Deployment & Ops',
        'security': 'Security Governance',
        'cost': 'Cost Optimization',
        'agents-create': 'Create Agent',
        'knowledge': 'Knowledge Base',
        'agents': 'Agent Center',
        'docs': 'Documents & Reports',
        'monitor': 'Monitoring Panel',
    };

    document.getElementById('generic-view-title').textContent = titles[viewId] || viewId;
}

// ========================================
// Conversation Management
// ========================================

function newConversation() {
    currentConversationId = null;
    clearChat();
    switchView('chat');
}

function clearChat() {
    const container = document.getElementById('chat-container');
    container.innerHTML = `
        <div class="welcome-message" id="welcome-message">
            <div class="welcome-icon">
                <i class="fa-solid fa-robot"></i>
            </div>
            <h2>AliCloud Agent Hub</h2>
            <p>Select actions or start conversation</p>
        </div>
    `;
    resetExecutionState();
}

function loadConversations() {
    // In a real app, this would fetch from API
    // For now, we'll just use localStorage
    const stored = localStorage.getItem('agent_conversations');
    if (stored) {
        conversations = JSON.parse(stored);
    }
    renderHistory();
}

function saveConversations() {
    localStorage.setItem('agent_conversations', JSON.stringify(conversations));
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');

    if (conversations.length === 0) {
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    const items = conversations.slice(0, 10).map(conv => {
        const date = formatDate(conv.updated_at);
        const isActive = conv.id === currentConversationId;
        return `
            <div class="history-item ${isActive ? 'active' : ''}" data-id="${conv.id}">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <div class="history-item-content">
                    <p class="history-item-title">${escapeHtml(conv.title || 'Untitled')}</p>
                    <p class="history-item-date">${date}</p>
                </div>
                <div class="history-item-actions">
                    <button class="btn-edit" onclick="event.stopPropagation(); renameConversation('${conv.id}')" title="Rename">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="btn-delete" onclick="event.stopPropagation(); deleteConversation('${conv.id}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = items + (empty.outerHTML);

    // Reattach event listeners
    list.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            loadConversation(item.dataset.id);
        });
    });
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return `${days} days ago`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function loadConversation(convId) {
    // In a real app, this would fetch from API
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    currentConversationId = convId;
    // For now, just show the conversation in the chat
    // In a real app, we'd load the messages
    renderHistory();
    switchView('chat');
}

function renameConversation(convId) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    const newTitle = prompt('Enter new title:', conv.title);
    if (newTitle && newTitle.trim()) {
        conv.title = newTitle.trim();
        conv.updated_at = new Date().toISOString();
        saveConversations();
        renderHistory();
    }
}

function deleteConversation(convId) {
    if (!confirm('Delete this conversation?')) return;

    conversations = conversations.filter(c => c.id !== convId);
    if (currentConversationId === convId) {
        currentConversationId = null;
        clearChat();
    }
    saveConversations();
    renderHistory();
    showToast('Conversation deleted');
}

function toggleHistory() {
    const toggle = document.getElementById('history-toggle');
    const list = document.getElementById('history-list');
    toggle.classList.toggle('expanded');
    list.style.display = toggle.classList.contains('expanded') ? 'block' : 'none';
}

// ========================================
// Chat Functions
// ========================================

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message || isStreaming) return;

    input.value = '';
    input.style.height = 'auto';
    isStreaming = true;

    // Show/hide elements
    document.getElementById('welcome-message')?.remove();
    document.getElementById('send-btn').classList.add('loading');
    document.getElementById('stop-streaming-container').classList.remove('hidden');

    // Add user message
    appendMessage('user', message);

    // Reset execution state
    resetExecutionState();

    // Update steps
    updateStep(1, 'running');
    addLog('info', 'Processing user request...');

    await delay(300);
    updateStep(1, 'completed');
    updateStep(2, 'running');
    addLog('info', 'Selecting appropriate agent...');

    await delay(300);
    updateStep(2, 'completed');
    updateStep(3, 'running');
    addLog('info', 'Sending request to AI model...');

    // Create conversation if needed
    if (!currentConversationId) {
        currentConversationId = generateId();
        conversations.unshift({
            id: currentConversationId,
            title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        saveConversations();
        renderHistory();
    }

    // Send request
    await sendRequest(message);
}

async function sendRequest(message) {
    const chatContainer = document.getElementById('chat-container');

    abortController = new AbortController();

    try {
        const response = await fetch(`${API_BASE_URL}/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                conversation_id: currentConversationId,
                knowledge_bases: selectedKbs,
                skill_id: selectedSkill || null,
                enable_tools: true,
            }),
            signal: abortController.signal,
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to get response');
        }

        updateStep(3, 'completed');
        updateStep(4, 'running');
        addLog('success', 'Response stream started');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        let botMessageDiv = null;
        let fullContent = '';
        let thinkingBuffer = '';
        let inThinking = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') break;

                    try {
                        const json = JSON.parse(dataStr);
                        console.log('[Frontend] Received:', json);

                        if (json.error) {
                            throw new Error(json.error);
                        }

                        if (json.type === 'thinking') {
                            thinkingBuffer = json.content;
                            renderThinkingUpdate(botMessageDiv, chatContainer, thinkingBuffer, fullContent, true);
                            if (!botMessageDiv) {
                                botMessageDiv = createBotMessage(chatContainer);
                            }
                        }
                        else if (json.type === 'token') {
                            fullContent += json.content;
                            if (!botMessageDiv) {
                                botMessageDiv = createBotMessage(chatContainer);
                            }
                            renderThinkingUpdate(botMessageDiv, chatContainer, thinkingBuffer, fullContent, false);
                        }
                        else if (json.type === 'tool_call') {
                            console.log(`[Tool Call] ${json.tool}`);
                            addLog('info', `Executing tool: ${json.tool}`);
                            showToolExecution({
                                tool: json.tool,
                                status: 'executing',
                                message: `Executing ${json.tool}...`,
                                startTime: Date.now(),
                            });
                        }
                        else if (json.type === 'tool_result') {
                            if (json.success) {
                                addLog('success', `Tool completed: ${json.tool}`);
                            } else {
                                addLog('error', `Tool failed: ${json.error}`);
                            }
                            showToolExecution({
                                tool: json.tool,
                                status: json.success ? 'done' : 'error',
                                message: json.success ? 'Tool completed' : `Tool failed: ${json.error}`,
                            });
                        }
                        else if (json.type === 'status') {
                            handleStatusUpdate(json);
                        }
                        else if (json.type === 'thinking_step') {
                            addThinkingStep(json);
                        }
                        else if (json.type === 'code_output') {
                            appendCodeOutput(json.content);
                        }
                        else if (json.type === 'code_block_start') {
                            showCodeBlock(json);
                        }
                        else if (json.type === 'code_block_end') {
                            finishCodeBlock(json);
                        }
                        else if (json.done) {
                            if (json.conversation_id && !currentConversationId) {
                                currentConversationId = json.conversation_id;
                            }
                        }
                    } catch (e) {
                        console.log('Parse error:', e);
                    }
                }
            }
        }

        updateStep(4, 'completed');
        addLog('success', 'Task completed successfully');

    } catch (error) {
        if (error.name !== 'AbortError') {
            addLog('error', `Error: ${error.message}`);
            appendError(error.message);
            updateStep(4, 'error');
        }
    } finally {
        isStreaming = false;
        document.getElementById('send-btn').classList.remove('loading');
        document.getElementById('stop-streaming-container').classList.add('hidden');
    }
}

function createBotMessage(container) {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `
        <div class="message-avatar">
            <i class="fa-solid fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="message-body"></div>
        </div>
    `;
    container.appendChild(div);
    return div;
}

function appendMessage(role, content) {
    const container = document.getElementById('chat-container');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="message-avatar">
            <i class="fa-solid fa-${role === 'user' ? 'user' : 'robot'}"></i>
        </div>
        <div class="message-content">
            <div class="markdown-content">${renderMarkdown(content)}</div>
        </div>
    `;
    container.appendChild(div);
    scrollToBottom(container);
}

function appendError(message) {
    const container = document.getElementById('chat-container');
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `
        <div class="message-avatar">
            <i class="fa-solid fa-robot"></i>
        </div>
        <div class="message-content" style="background-color: #FEF2F2; border: 1px solid #EF4444;">
            <p style="color: #DC2626;">Error: ${escapeHtml(message)}</p>
        </div>
    `;
    container.appendChild(div);
    scrollToBottom(container);
}

function scrollToBottom(container) {
    container.scrollTop = container.scrollHeight;
}

// ========================================
// Thinking & Markdown Rendering
// ========================================

function renderThinkingUpdate(botMessageDiv, container, thinking, content, isStreaming) {
    const body = botMessageDiv.querySelector('.message-body');
    let html = '';

    if (thinking) {
        html += renderThinkingBlock(thinking, isStreaming);
    }

    if (content) {
        html += `<div class="markdown-content">${renderMarkdown(content)}</div>`;
    }

    body.innerHTML = html;
    scrollToBottom(container);
}

function renderThinkingBlock(thinking, isStreaming) {
    const cursor = isStreaming ? '<span class="thinking-cursor"></span>' : '';
    return `
        <div class="thinking-block">
            <div class="thinking-header">
                <div class="thinking-header-left">
                    <div class="thinking-header-icon">
                        <i class="fa-solid fa-brain"></i>
                    </div>
                    <span class="thinking-header-title">Thinking</span>
                </div>
            </div>
            <div class="thinking-body">
                <div class="thinking-content">${escapeHtml(thinking)}${cursor}</div>
            </div>
        </div>
    `;
}

function renderMarkdown(content) {
    // Remove thinking tags
    let result = content.replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/g, '');

    // Escape HTML first
    result = escapeHtml(result);

    // Code blocks
    result = result.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<div class="code-block"><pre>${code.trim()}</pre></div>`;
    });

    // Inline code
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Headers
    result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Lists
    result = result.replace(/^- (.+)$/gm, '<li>$1</li>');
    result = result.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Line breaks
    result = result.replace(/\n\n/g, '</p><p>');
    result = result.replace(/\n/g, '<br>');

    return `<p>${result}</p>`;
}

// ========================================
// Tool Execution
// ========================================

function showToolExecution(status) {
    const card = document.getElementById('tool-execution-card');
    const message = card.querySelector('.tool-execution-message');
    const timeValue = card.querySelector('.execution-time-value');
    const progressContainer = document.getElementById('progress-container');
    const progressText = document.getElementById('progress-text');
    const progressFill = document.getElementById('progress-fill');
    const fileInfo = document.getElementById('tool-file-info');
    const filename = document.getElementById('tool-filename');

    card.classList.remove('hidden', 'preparing', 'executing', 'writing', 'complete', 'done', 'error');
    card.classList.add(status.status);
    message.textContent = status.message;

    if (status.status === 'done') {
        const elapsed = ((Date.now() - status.startTime) / 1000).toFixed(1);
        timeValue.textContent = elapsed + 's';
    } else if (status.status === 'error') {
        const elapsed = ((Date.now() - status.startTime) / 1000).toFixed(1);
        timeValue.textContent = elapsed + 's';
    }

    // Show/hide progress
    if (status.progress !== undefined) {
        progressContainer.classList.remove('hidden');
        progressText.textContent = `${status.progress}%`;
        progressFill.style.width = `${status.progress}%`;
    } else {
        progressContainer.classList.add('hidden');
    }

    // Show/hide file info
    if (status.fileName) {
        fileInfo.classList.remove('hidden');
        filename.textContent = status.fileName;
    } else {
        fileInfo.classList.add('hidden');
    }
}

function handleStatusUpdate(json) {
    const statusContent = json.content;
    const toolName = json.tool || '';
    const message = json.message || '';

    if (statusContent === 'preparing') {
        showToolExecution({
            tool: toolName,
            status: 'preparing',
            message: message || `Preparing ${toolName}...`,
            startTime: Date.now(),
        });
    }
    else if (statusContent === 'executing') {
        showToolExecution({
            tool: toolName,
            status: 'executing',
            message: message || `Executing ${toolName}...`,
            startTime: Date.now(),
        });
    }
    else if (statusContent === 'writing') {
        showToolExecution({
            tool: toolName,
            status: 'writing',
            message: message || 'Writing file...',
            startTime: Date.now(),
            progress: json.progress,
            fileName: json.file_name,
        });
    }
    else if (statusContent === 'complete') {
        showToolExecution({
            tool: toolName,
            status: 'complete',
            message: `${toolName} completed`,
            startTime: Date.now(),
        });
    }
    else if (statusContent === 'done') {
        showToolExecution({
            tool: toolName,
            status: 'done',
            message: 'Done',
            startTime: Date.now(),
        });
    }
}

function appendCodeOutput(content) {
    const codeContent = document.getElementById('code-output-content');
    if (codeContent) {
        codeContent.textContent += content;
    }
}

function showCodeBlock(info) {
    const block = document.getElementById('code-output-block');
    const filename = document.getElementById('code-output-filename');
    const meta = document.getElementById('code-output-meta');
    const content = document.getElementById('code-output-content');

    block.classList.remove('hidden');
    filename.textContent = info.file_name || 'File';
    meta.textContent = info.language;
    content.textContent = '';
}

function finishCodeBlock(info) {
    const meta = document.getElementById('code-output-meta');
    meta.textContent = `${info.language} • ${info.total_lines || 0} lines`;
}

function toggleCodeOutput() {
    const body = document.getElementById('code-output-body');
    const icon = document.getElementById('code-output-toggle-icon');
    body.classList.toggle('hidden');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-right');
}

// ========================================
// Thinking Steps
// ========================================

function addThinkingStep(step) {
    const container = document.getElementById('thinking-steps-list');
    container.classList.remove('hidden');

    const item = document.createElement('div');
    item.className = 'thinking-step-item';
    if (step.result_summary) {
        item.classList.add('completed');
    }
    item.innerHTML = `
        <div class="thinking-step-icon">
            <i class="fa-solid fa-chevron-right"></i>
        </div>
        <div class="thinking-step-content">
            <span class="thinking-step-text">${escapeHtml(step.content)}</span>
            ${step.result_summary ? `<div class="thinking-step-summary">${escapeHtml(step.result_summary)}</div>` : ''}
        </div>
    `;
    container.appendChild(item);
    scrollToBottom(container);
}

// ========================================
// Execution State
// ========================================

function resetExecutionState() {
    // Reset steps
    document.querySelectorAll('.step-item').forEach(item => {
        item.className = 'step-item';
        const icon = item.querySelector('.step-icon');
        icon.className = 'step-icon pending';
        icon.innerHTML = '<i class="fa-solid fa-circle"></i>';
    });

    // Reset logs
    const logsList = document.getElementById('logs-list');
    logsList.innerHTML = `
        <div class="log-entry info">
            <span class="log-time">--:--:--</span>
            <i class="fa-solid fa-circle-info log-icon"></i>
            <span class="log-message">System ready</span>
        </div>
    `;

    // Hide tool execution
    document.getElementById('tool-execution-card').classList.add('hidden');
    document.getElementById('code-output-block').classList.add('hidden');
    document.getElementById('thinking-steps-list').classList.add('hidden');
}

function updateStep(stepNum, status) {
    const stepItem = document.querySelector(`.step-item[data-step="${stepNum}"]`);
    if (!stepItem) return;

    const icon = stepItem.querySelector('.step-icon');
    stepItem.className = `step-item ${status}`;
    icon.className = `step-icon ${status}`;

    const icons = {
        pending: '<i class="fa-solid fa-circle"></i>',
        running: '<i class="fa-solid fa-spinner"></i>',
        completed: '<i class="fa-solid fa-check"></i>',
        error: '<i class="fa-solid fa-xmark"></i>',
    };
    icon.innerHTML = icons[status] || icons.pending;
}

function addLog(type, message) {
    const logsList = document.getElementById('logs-list');
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const icons = {
        info: 'fa-circle-info',
        success: 'fa-circle-check',
        warning: 'fa-triangle-exclamation',
        error: 'fa-circle-xmark',
    };

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <i class="fa-solid ${icons[type]} log-icon"></i>
        <span class="log-message">${escapeHtml(message)}</span>
    `;
    logsList.appendChild(entry);
    scrollToBottom(logsList);
}

function stopStreaming() {
    if (abortController) {
        abortController.abort();
        isStreaming = false;
        addLog('warning', 'Response generation stopped by user');
        document.getElementById('send-btn').classList.remove('loading');
        document.getElementById('stop-streaming-container').classList.add('hidden');
    }
}

// ========================================
// Execution Panel Toggle
// ========================================

function toggleExecutionPanel() {
    const panel = document.getElementById('execution-panel');
    panel.classList.toggle('hidden');
}

// ========================================
// Knowledge Base & Skill Selectors
// ========================================

function toggleKbDropdown(event) {
    event.stopPropagation();
    closeAllDropdowns();
    document.getElementById('kb-menu').classList.toggle('hidden');
}

function toggleKbSelection(kbId) {
    const index = selectedKbs.indexOf(kbId);
    if (index === -1) {
        selectedKbs.push(kbId);
    } else {
        selectedKbs.splice(index, 1);
    }
    updateKbButton();
    updateKbMenu();
}

function updateKbButton() {
    const button = document.getElementById('kb-button-text');
    if (selectedKbs.length === 0) {
        button.textContent = 'Select Knowledge Base';
    } else if (selectedKbs.length === 1) {
        const kb = KNOWLEDGE_BASES.find(k => k.id === selectedKbs[0]);
        button.textContent = kb ? kb.name : 'Select Knowledge Base';
    } else {
        button.textContent = `${selectedKbs.length} selected`;
    }
}

function updateKbMenu() {
    document.querySelectorAll('#kb-menu .skill-selector-item').forEach(item => {
        const kbId = item.dataset.kb;
        item.classList.toggle('selected', selectedKbs.includes(kbId));
    });
}

function toggleSkillDropdown(event) {
    event.stopPropagation();
    closeAllDropdowns();
    document.getElementById('skill-menu').classList.toggle('hidden');
}

function selectSkill(skillId) {
    selectedSkill = skillId;
    updateSkillButton();
    updateSkillMenu();
}

function updateSkillButton() {
    const button = document.getElementById('skill-button-text');
    if (!selectedSkill) {
        button.textContent = 'Select Skill (Optional)';
    } else {
        const skill = skills.find(s => s.id === selectedSkill);
        button.textContent = skill ? skill.name : 'Select Skill (Optional)';
    }
}

function updateSkillMenu() {
    document.querySelectorAll('#skill-menu .skill-selector-item').forEach(item => {
        const skillId = item.dataset.skill;
        item.classList.toggle('selected', skillId === selectedSkill);
    });
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.add('hidden');
    });
}

// Close dropdowns when clicking outside
document.addEventListener('click', closeAllDropdowns);

// ========================================
// Skills Management
// ========================================

function loadSkills() {
    fetch(`${API_BASE_URL}/skills`)
        .then(response => response.json())
        .then(data => {
            skills = Array.isArray(data) ? data : (data.skills || []);
            populateSkillMenu();
        })
        .catch(error => {
            console.error('Failed to load skills:', error);
            skills = [];
        });
}

function populateSkillMenu() {
    const menu = document.getElementById('skill-menu');
    const items = skills.map(skill => `
        <div class="skill-selector-item" data-skill="${skill.id}" onclick="selectSkill('${skill.id}')">
            <div class="skill-selector-name">
                <span>${escapeHtml(skill.name)}</span>
                <i class="fa-solid fa-check"></i>
            </div>
            <p class="skill-selector-desc">${escapeHtml(skill.description || '')}</p>
        </div>
    `).join('');

    // Keep the header and first item (No Skill option)
    const header = menu.querySelector('.skill-selector-header').outerHTML;
    const noSkillItem = menu.querySelector('.skill-selector-item[data-skill=""]').outerHTML;
    menu.innerHTML = header + noSkillItem + items;
}

function loadSkillsPage() {
    const container = document.getElementById('skills-container');
    container.innerHTML = '<div class="loading">Loading skills...</div>';

    fetch(`${API_BASE_URL}/skills`)
        .then(response => response.json())
        .then(data => {
            const skillList = Array.isArray(data) ? data : (data.skills || []);
            if (skillList.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-puzzle-piece"></i><p>No skills available</p></div>';
                return;
            }

            container.innerHTML = skillList.map(skill => `
                <div class="skill-card">
                    <div class="skill-card-header">
                        <h3>${escapeHtml(skill.name)}</h3>
                        <span class="skill-status ${skill.enabled ? 'enabled' : 'disabled'}">
                            ${skill.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    <p class="skill-card-desc">${escapeHtml(skill.description || 'No description')}</p>
                    <div class="skill-card-meta">
                        <span>${escapeHtml(skill.category || 'Uncategorized')}</span>
                        <span>v${skill.version || '1.0.0'}</span>
                    </div>
                </div>
            `).join('');
        })
        .catch(error => {
            console.error('Failed to load skills:', error);
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-exclamation-circle"></i><p>Failed to load skills</p></div>';
        });
}

function showCreateSkillDialog() {
    showDialog('Create New Skill', `
        <div class="form-group">
            <label>Skill Name</label>
            <input type="text" id="new-skill-name" placeholder="Enter skill name">
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea id="new-skill-desc" placeholder="Enter description" rows="3"></textarea>
        </div>
        <div class="form-group">
            <label>Category</label>
            <input type="text" id="new-skill-category" placeholder="Enter category">
        </div>
    `, [
        { text: 'Cancel', class: 'btn-outline', action: hideDialog },
        { text: 'Create', class: 'btn-primary', action: createSkill },
    ]);
}

// ========================================
// Workspace
// ========================================

function loadWorkspace() {
    const fileTree = document.getElementById('file-tree');
    fileTree.innerHTML = '<div class="loading">Loading files...</div>';

    fetch(`${API_BASE_URL}/workspace/files`)
        .then(response => response.json())
        .then(files => {
            if (!Array.isArray(files) || files.length === 0) {
                fileTree.innerHTML = '<div class="empty-state" style="padding: 20px;"><p style="color: #9CA3AF;">No files in workspace</p></div>';
                return;
            }

            const tree = buildFileTree(files);
            fileTree.innerHTML = renderFileTree(tree);
        })
        .catch(error => {
            console.error('Failed to load workspace:', error);
            fileTree.innerHTML = '<div class="empty-state" style="padding: 20px;"><p style="color: #EF4444;">Failed to load files</p></div>';
        });
}

function buildFileTree(files) {
    const tree = { name: 'workspace', type: 'folder', children: [] };

    files.forEach(file => {
        const parts = file.path.split('/');
        let current = tree;

        parts.forEach((part, index) => {
            let child = current.children.find(c => c.name === part);
            if (!child) {
                child = {
                    name: part,
                    type: index === parts.length - 1 ? 'file' : 'folder',
                    children: [],
                    fullPath: file.path,
                };
                current.children.push(child);
            }
            current = child;
        });
    });

    return tree;
}

function renderFileTree(node, level = 0) {
    if (node.type === 'file') {
        return `
            <li class="file" onclick="openFile('${node.fullPath.replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-file-code"></i> ${escapeHtml(node.name)}
            </li>
        `;
    }

    const childrenHtml = node.children.map(child => renderFileTree(child, level + 1)).join('');
    return `
        <li class="folder">
            <i class="fa-solid fa-folder"></i> ${escapeHtml(node.name)}
            <ul>${childrenHtml}</ul>
        </li>
    `;
}

function openFile(filePath) {
    const editor = document.getElementById('file-editor');
    editor.innerHTML = `
        <div class="editor-toolbar">
            <span class="editor-filename">${escapeHtml(filePath)}</span>
            <button class="btn btn-primary" onclick="saveFile('${filePath.replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-save"></i> Save
            </button>
        </div>
        <div class="editor-content">
            <textarea id="file-content">Loading...</textarea>
        </div>
    `;

    fetch(`${API_BASE_URL}/workspace/files/${encodeURIComponent(filePath)}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('file-content').value = data.content || '';
        })
        .catch(error => {
            document.getElementById('file-content').value = 'Failed to load file';
        });
}

function saveFile(filePath) {
    const content = document.getElementById('file-content').value;
    fetch(`${API_BASE_URL}/workspace/files/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    })
    .then(() => showToast('File saved successfully'))
    .catch(() => showToast('Failed to save file', 'error'));
}

function showUploadDialog() {
    showDialog('Upload File', `
        <div class="form-group">
            <label>Select File</label>
            <input type="file" id="upload-file" style="padding: 8px 0;">
        </div>
    `, [
        { text: 'Cancel', class: 'btn-outline', action: hideDialog },
        { text: 'Upload', class: 'btn-primary', action: uploadFile },
    ]);
}

function uploadFile() {
    const fileInput = document.getElementById('upload-file');
    const file = fileInput.files[0];
    if (!file) {
        showToast('Please select a file', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    fetch(`${API_BASE_URL}/workspace/upload`, {
        method: 'POST',
        body: formData,
    })
    .then(() => {
        hideDialog();
        loadWorkspace();
        showToast('File uploaded successfully');
    })
    .catch(() => showToast('Failed to upload file', 'error'));
}

// ========================================
// Settings
// ========================================

function loadSettings() {
    document.getElementById('api-key').value = localStorage.getItem('agent_api_key') || '';
    document.getElementById('api-url').value = localStorage.getItem('agent_api_url') || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    document.getElementById('model-select').value = localStorage.getItem('agent_model') || 'qwen3-max';
}

function saveSettings() {
    localStorage.setItem('agent_api_key', document.getElementById('api-key').value);
    localStorage.setItem('agent_api_url', document.getElementById('api-url').value);
    localStorage.setItem('agent_model', document.getElementById('model-select').value);
    showToast('Settings saved successfully');
}

function showSettings() {
    switchView('settings');
}

// ========================================
// Memory Panel (placeholder)
// ========================================

function toggleMemoryPanel() {
    showToast('Memory panel coming soon!', 'info');
}

// ========================================
// Dialog Utilities
// ========================================

function showDialog(title, content, buttons) {
    const overlay = document.getElementById('dialog-overlay');
    const dialogContent = document.getElementById('dialog-content');

    const buttonsHtml = buttons.map(btn =>
        `<button class="btn ${btn.class}" onclick="(${btn.action.toString()})()">${btn.text}</button>`
    ).join('');

    dialogContent.innerHTML = `
        <div class="dialog-header">
            <h3>${title}</h3>
            <button class="dialog-close" onclick="hideDialog()">&times;</button>
        </div>
        ${content}
        <div class="dialog-footer">${buttonsHtml}</div>
    `;

    overlay.classList.add('show');
}

function hideDialog() {
    document.getElementById('dialog-overlay').classList.remove('show');
}

function createSkill() {
    const name = document.getElementById('new-skill-name').value.trim();
    const desc = document.getElementById('new-skill-desc').value.trim();
    const category = document.getElementById('new-skill-category').value.trim();

    if (!name) {
        showToast('Please enter skill name', 'error');
        return;
    }

    fetch(`${API_BASE_URL}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: generateId(),
            name,
            description: desc,
            enabled: true,
            category: category || 'Uncategorized',
            version: '1.0.0',
        }),
    })
    .then(() => {
        hideDialog();
        loadSkills();
        loadSkillsPage();
        showToast('Skill created successfully');
    })
    .catch(() => showToast('Failed to create skill', 'error'));
}

// ========================================
// Toast Notifications
// ========================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : type === 'error' ? 'xmark' : 'info'}"></i>${escapeHtml(message)}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ========================================
// Utility Functions
// ========================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
