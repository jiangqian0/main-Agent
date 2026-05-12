/**
 * chat-stream.js — Streaming & rendering module
 * 负责：SSE 事件处理、消息创建、流式渲染、Thinking 区域、代码块
 */

const API_BASE_URL = '/api';

// STEPS map (used in execution logging)
const STEPS = {
  1: 'Understanding Intent',
  2: 'Selecting Agent',
  3: 'Processing Request',
  4: 'Generating Response',
};

let abortController = null;
let isStreaming = false;
let streamState = {
  thinkingBuffer: '',
  textBuffer: '',
  codeBlockBuffer: '',
  codeBlockActive: false,
  codeBlockInfo: null,
  currentTool: null,
  toolResults: [],
  $streamingMsg: null,     // 助手消息 DOM 根元素
  $thinkingBlock: null,    // Thinking 块 DOM
  $codeBlock: null,        // 代码块 DOM
  thinkingExpanded: true,
  thinkingVisible: false,
  pendingText: '',         // 流式中的文字（未永久）
};

// ─── Core: Send Request ───────────────────────────────────────────────────────

async function sendMessage() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg || isStreaming) return;
  input.value = '';
  input.style.height = 'auto';

  isStreaming = true;
  document.getElementById('welcome-message')?.remove();
  document.getElementById('send-btn')?.classList.add('loading');
  document.getElementById('stop-btn')?.classList.remove('hidden');
  switchPanel('execution');

  streamReset();
  resetStreamState();
  resetExecutionState();

  // 确保对话已创建（自动标题）
  ensureConversation(msg);

  // UI: 添加用户消息
  appendUserMessage(msg, true);

  // 立即创建助手消息占位符，显示 "分析中..." 状态
  streamState.$streamingMsg = streamCreateAssistantMessage();
  streamRenderAnalyzingState();

  // 更新右侧面板状态
  execSetStep(1, 'running');
  execSetStep(2, 'running');
  execAddLog('info', 'AI 正在分析请求...');

  // 自动匹配 Skill（异步，不阻塞）
  let effectiveSkillId = window.selectedSkillId || '';
  if (!effectiveSkillId) {
    fetch(`${API_BASE_URL}/skills/match?message=${encodeURIComponent(msg)}`)
      .then(r => r.ok ? r.json() : null)
      .then(match => {
        if (match && match.id) {
          window.selectedSkillId = match.id;
        }
      }).catch(() => {});
  }

  abortController = new AbortController();
  await streamFetch(msg, effectiveSkillId);
}

async function streamFetch(message, skillId) {
  const model = document.getElementById('model-select')?.value || 'qwen3-max';
  const kbIds = window.selectedKbIds.size > 0 ? [...window.selectedKbIds] : undefined;

  try {
    const resp = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversation_id: window.currentConversationId,
        skill_id: skillId || null,
        enable_tools: true,
        model,
        knowledge_bases: kbIds,
      }),
      signal: abortController.signal
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

    execSetStep(1, 'completed');
    execSetStep(2, 'completed');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          streamHandleEvent(JSON.parse(dataStr));
        } catch (e) {
          console.warn('Stream parse error', e);
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      execAddLog('error', `Error: ${err.message}`);
      streamAppendError(err.message);
    }
  } finally {
    streamFinalize();
  }
}

function stopStreaming() {
  if (abortController) {
    abortController.abort();
    abortController = null;
    isStreaming = false;
    execAddLog('warning', 'Stopped by user');
    streamFinalize();
  }
}

// ─── State Reset ──────────────────────────────────────────────────────────────

function streamReset() {
  streamState.thinkingBuffer = '';
  streamState.textBuffer = '';
  streamState.codeBlockBuffer = '';
  streamState.codeBlockActive = false;
  streamState.codeBlockInfo = null;
  streamState.currentTool = null;
  streamState.toolResults = [];
  streamState.$streamingMsg = null;
  streamState.$thinkingBlock = null;
  streamState.$codeBlock = null;
  streamState.thinkingExpanded = true;
  streamState.thinkingVisible = false;
  streamState.pendingText = '';
  if (streamState._analyzingTimer) {
    clearInterval(streamState._analyzingTimer);
    streamState._analyzingTimer = null;
  }
}

function resetStreamState() {
  streamReset();
}

// ─── SSE Event Router ────────────────────────────────────────────────────────

function streamHandleEvent(json) {
  const t = json.type;

  switch (t) {
    case 'thinking':
      streamState.thinkingBuffer = json.content || '';
      streamState.thinkingVisible = streamState.thinkingBuffer.length > 0;
      streamRenderThinking();
      break;

    case 'thinking_end':
      streamRenderThinking();
      execSetStep(3, 'running');
      execAddLog('info', 'Building response...');
      break;

    case 'token':
      streamState.pendingText += json.content || '';
      streamState.textBuffer += json.content || '';
      streamRenderText();
      break;

    case 'tool_call':
      if (!['Write', 'write_file', 'create_file'].includes(json.tool)) {
        execAddLog('info', `Calling tool: ${json.tool}`);
      }
      streamState.toolResults.push({
        name: json.tool,
        tool_call_id: json.tool_call_id,
        args: json.args || {},
        status: 'running',
        success: null,
        result: null,
        error: null
      });
      execUpdateTools(streamState.toolResults);
      execSetStep(3, 'running');
      break;

    case 'tool_result': {
      const tr = streamState.toolResults.find(r => r.tool_call_id === json.tool_call_id);
      if (tr) {
        Object.assign(tr, {
          status: 'done',
          success: json.success,
          result: json.result,
          error: json.error
        });
      }
      execUpdateTools(streamState.toolResults);
      if (!['Write', 'write_file', 'create_file'].includes(json.tool)) {
        execAddLog(json.success ? 'success' : 'error', `Tool ${json.tool} ${json.success ? 'done' : 'failed'}`);
      }
      break;
    }

    case 'code_block_start':
      streamState.codeBlockActive = true;
      streamState.codeBlockBuffer = '';
      streamState.codeBlockInfo = {
        file_name: json.file_name,
        language: json.language,
        total_lines: json.total_lines
      };
      streamRenderCodeStart();
      break;

    case 'code_output':
      streamState.codeBlockBuffer += json.content || '';
      streamCodeProgress(json.progress, json.written, json.total);
      break;

    case 'code_block_end':
      streamState.codeBlockActive = false;
      streamCodeEnd();
      break;

    case 'done':
      streamOnDone();
      break;

    case 'workspace_refresh':
      if (typeof window.refreshWorkspacePanel === 'function') {
        window.refreshWorkspacePanel();
      }
      break;

    case 'error':
      streamAppendError(json.content);
      break;
  }
}

// ─── Analyzing State ─────────────────────────────────────────────────────────────

function streamRenderAnalyzingState() {
  const container = document.getElementById('chat-container');
  if (!container || !streamState.$streamingMsg) return;

  const msgBody = streamState.$streamingMsg.querySelector('.message-body');
  if (!msgBody) return;

  // 移除已有的 thinking / response 区域
  msgBody.querySelectorAll('.thinking-area, .response-area').forEach(el => el.remove());

  const html = `<div class="response-area analyzing-state">
    <div class="analyzing-indicator">
      <div class="analyzing-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      <span class="analyzing-text">正在分析请求</span>
    </div>
  </div>`;
  msgBody.insertAdjacentHTML('beforeend', html);
  container.scrollTop = container.scrollHeight;

  // 文字 "正在分析请求" 后面的点动画
  const dots = ['.', '.', '..', '...'];
  let di = 0;
  streamState._analyzingTimer = setInterval(() => {
    const textEl = msgBody.querySelector('.analyzing-text');
    if (textEl) textEl.textContent = '正在分析请求' + dots[di % dots.length];
    di++;
  }, 500);
}

// ─── Stream Finalize ─────────────────────────────────────────────────────────

function streamFinalize() {
  isStreaming = false;
  abortController = null;
  document.getElementById('send-btn')?.classList.remove('loading');
  document.getElementById('stop-btn')?.classList.add('hidden');

  // 永久化消息到 storage
  const text = streamState.textBuffer;
  if (text) {
    persistAssistantMessage(text);
  }

  execSetStep(4, 'completed');
  execAddLog('success', 'Response complete');

  // 清理流式状态 + 定时器
  if (streamState._analyzingTimer) {
    clearInterval(streamState._analyzingTimer);
    streamState._analyzingTimer = null;
  }
  if (streamState.$streamingMsg) {
    streamState.$streamingMsg.classList.remove('streaming');
  }
  streamState.$streamingMsg = null;
  streamState.$thinkingBlock = null;
  streamState.$codeBlock = null;

  const container = document.getElementById('chat-container');
  if (container) container.scrollTop = container.scrollHeight;
}

function streamOnDone() {
  // 仅处理 done 逻辑，streamFinalize() 会在 finally 中调用
  execSetStep(4, 'running');
}

// ─── Thinking Area ─────────────────────────────────────────────────────────────
// Cursor-style: Thinking 区域独立于消息内容，显示在消息上方，可折叠

function streamRenderThinking() {
  const container = document.getElementById('chat-container');
  if (!container) return;

  // 确保助手消息元素存在
  if (!streamState.$streamingMsg) {
    streamState.$streamingMsg = streamCreateAssistantMessage();
  }

  const msgBody = streamState.$streamingMsg.querySelector('.message-body');
  if (!msgBody) return;

  // 清除"分析中"状态 + 定时器
  msgBody.querySelectorAll('.analyzing-state').forEach(el => el.remove());
  if (streamState._analyzingTimer) {
    clearInterval(streamState._analyzingTimer);
    streamState._analyzingTimer = null;
  }

  const thinkingEl = msgBody.querySelector('.thinking-area');

  if (!streamState.thinkingVisible || !streamState.thinkingBuffer) {
    if (thinkingEl) thinkingEl.remove();
    return;
  }

  const html = `<div class="thinking-area">
    <div class="thinking-area-header" onclick="streamToggleThinking(this.parentElement)">
      <div class="thinking-area-header-left">
        <div class="thinking-area-icon"><i class="fa-solid fa-brain"></i></div>
        <span class="thinking-area-label">Thinking</span>
      </div>
      <div class="thinking-area-toggle ${streamState.thinkingExpanded ? 'expanded' : ''}">
        <i class="fa-solid fa-chevron-down"></i>
      </div>
    </div>
    <div class="thinking-area-body ${streamState.thinkingExpanded ? '' : 'hidden'}">
      <div class="thinking-area-content">${escapeHtml(streamState.thinkingBuffer)}</div>
    </div>
  </div>`;

  if (thinkingEl) {
    thinkingEl.outerHTML = html;
  } else {
    msgBody.insertAdjacentHTML('afterbegin', html);
  }
  container.scrollTop = container.scrollHeight;
}

function streamToggleThinking(el) {
  const body = el.querySelector('.thinking-area-body');
  const toggle = el.querySelector('.thinking-area-toggle');
  const hidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !hidden);
  toggle.classList.toggle('expanded', hidden);
}

// ─── Text Rendering ───────────────────────────────────────────────────────────

function streamRenderText() {
  const container = document.getElementById('chat-container');
  if (!container) return;

  if (!streamState.$streamingMsg) {
    streamState.$streamingMsg = streamCreateAssistantMessage();
  }

  const msgBody = streamState.$streamingMsg.querySelector('.message-body');
  if (!msgBody) return;

  // 清除"分析中"状态 + 定时器
  msgBody.querySelectorAll('.analyzing-state').forEach(el => el.remove());
  if (streamState._analyzingTimer) {
    clearInterval(streamState._analyzingTimer);
    streamState._analyzingTimer = null;
  }

  // 渲染回复区域（永久内容）
  let responseEl = msgBody.querySelector('.response-area');
  if (!responseEl) {
    responseEl = document.createElement('div');
    responseEl.className = 'response-area';
    msgBody.appendChild(responseEl);
  }
  responseEl.innerHTML = renderMarkdown(streamState.textBuffer) + '<span class="cursor-blink"></span>';

  container.scrollTop = container.scrollHeight;
}

// ─── Message DOM ──────────────────────────────────────────────────────────────

function streamCreateAssistantMessage() {
  const container = document.getElementById('chat-container');
  if (!container) return null;

  const div = document.createElement('div');
  div.className = 'message assistant streaming';
  div.innerHTML = `<div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="message-content"><div class="message-body"></div></div>`;
  container.appendChild(div);
  return div;
}

function appendUserMessage(content, persist = true) {
  const container = document.getElementById('chat-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `<div class="message-avatar"><i class="fa-solid fa-user"></i></div>
    <div class="message-content"><div class="message-body"><div class="markdown-content">${renderMarkdown(content)}</div></div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  if (persist) persistUserMessage(content);
}

function appendAssistantMessage(content, persist = true) {
  const container = document.getElementById('chat-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `<div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="message-content"><div class="message-body"><div class="response-area"><div class="markdown-content">${renderMarkdown(content)}</div></div></div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  if (persist) persistAssistantMessage(content);
}

function streamAppendError(msg) {
  const container = document.getElementById('chat-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `<div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="message-content"><div class="message-body"><div class="error-message"><i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(msg)}</div></div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ─── Code Blocks ───────────────────────────────────────────────────────────────

function streamRenderCodeStart() {
  const container = document.getElementById('chat-container');
  if (!container) return;

  if (!streamState.$streamingMsg) {
    streamState.$streamingMsg = streamCreateAssistantMessage();
  }

  const msgBody = streamState.$streamingMsg.querySelector('.message-body');
  if (!msgBody) return;

  const info = streamState.codeBlockInfo || {};
  const block = document.createElement('div');
  block.className = 'code-block-collapsible streaming';
  block.innerHTML = `<div class="code-block-collapsible-header">
    <span class="code-block-file-name">
      <i class="fa-solid fa-file-code"></i>
      <span class="code-lang-label">${escapeHtml(info.file_name || 'output')}</span>
      <span class="code-lang-tag">${escapeHtml(info.language || 'text')}</span>
    </span>
    <div class="code-block-collapsible-actions">
      <button class="code-toggle-btn" onclick="toggleCodeBlock(this)">
        <i class="fa-solid fa-eye"></i> Expand
      </button>
    </div>
  </div>
  <div class="code-block-collapsible-body">
    <div class="code-collapsed-preview"></div>
    <pre class="code-collapsed-actual"><code class="code-block-code language-${info.language || 'text'}"></code></pre>
    <div class="code-streaming-progress-bar" style="display:none">
      <div class="code-streaming-progress-fill"></div>
      <span class="code-streaming-progress-text">0%</span>
    </div>
  </div>`;

  const respArea = msgBody.querySelector('.response-area');
  if (respArea) {
    respArea.insertAdjacentElement('beforebegin', block);
  } else {
    msgBody.appendChild(block);
  }

  streamState.$codeBlock = block;
  // Start collapsed - hide the preview, show actual
  const preview = block.querySelector('.code-collapsed-preview');
  const actual = block.querySelector('.code-collapsed-actual');
  const progressBar = block.querySelector('.code-streaming-progress-bar');
  const toggleBtn = block.querySelector('.code-toggle-btn');
  if (preview) preview.style.display = 'none';
  if (actual) actual.style.display = 'block';
  if (progressBar) progressBar.style.display = 'flex';
  if (toggleBtn) toggleBtn.style.display = 'none'; // hide toggle during streaming

  container.scrollTop = container.scrollHeight;
}

function streamCodeProgress(progress, written, total) {
  if (!streamState.$codeBlock) return;
  const fill = streamState.$codeBlock.querySelector('.code-streaming-progress-fill');
  const txt = streamState.$codeBlock.querySelector('.code-streaming-progress-text');
  const codeEl = streamState.$codeBlock.querySelector('.code-block-code');
  const preEl = streamState.$codeBlock.querySelector('.code-collapsed-actual');

  if (fill) fill.style.width = `${progress}%`;
  if (txt) txt.textContent = `${progress}% (${written}/${total})`;
  if (codeEl) codeEl.textContent = streamState.codeBlockBuffer;
  if (preEl) preEl.scrollTop = preEl.scrollHeight;

  const container = document.getElementById('chat-container');
  if (container) container.scrollTop = container.scrollHeight;
}

function streamCodeEnd() {
  if (!streamState.$codeBlock) return;
  const fill = streamState.$codeBlock.querySelector('.code-streaming-progress-fill');
  const txt = streamState.$codeBlock.querySelector('.code-streaming-progress-text');
  const toggleBtn = streamState.$codeBlock.querySelector('.code-toggle-btn');
  const progressBar = streamState.$codeBlock.querySelector('.code-streaming-progress-bar');
  if (fill) fill.style.width = '100%';
  if (txt) txt.textContent = '100%';
  if (progressBar) progressBar.style.display = 'none';
  streamState.$codeBlock.classList.remove('streaming');

  // Show toggle button if code is long
  const codeEl = streamState.$codeBlock.querySelector('.code-block-code');
  if (codeEl && codeEl.textContent.length > 300) {
    if (toggleBtn) {
      toggleBtn.style.display = 'inline-flex';
      toggleBtn.disabled = false;
    }
    // Collapse the actual content, show preview
    const preview = streamState.$codeBlock.querySelector('.code-collapsed-preview');
    const actual = streamState.$codeBlock.querySelector('.code-collapsed-actual');
    const short = codeEl.textContent.slice(0, 300);
    if (preview) {
      preview.style.display = 'block';
      preview.textContent = short + '\n<span class="code-ellipsis">...</span>';
    }
    if (actual) actual.style.display = 'none';
  } else {
    if (toggleBtn) toggleBtn.style.display = 'none';
  }

  streamState.$codeBlock = null;

  const container = document.getElementById('chat-container');
  if (container) container.scrollTop = container.scrollHeight;
}

// ─── Markdown & Utils (needed by stream module) ─────────────────────────────────

function escapeHtml(t) {
  if (!t) return '';
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(content) {
  if (!content) return '';
  let r = content.replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/g, '');
  r = escapeHtml(r);

  r = r.replace(/^- \[x\]\s*(.+)$/gm, '<li class="task-done"><i class="fa-regular fa-check-square"></i>$1</li>');
  r = r.replace(/^- \[ \]\s*(.+)$/gm, '<li class="task-pending"><i class="fa-regular fa-square"></i>$1</li>');
  r = r.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const fileName = lang ? lang : 'code';
    const displayLang = lang || 'text';
    const safeCode = code.trim();
    const shortCode = safeCode.slice(0, 200);
    const isLong = safeCode.split('\n').length > 10 || safeCode.length > 300;
    const codeContent = isLong
      ? `<div class="code-collapsed-preview">${escapeHtml(shortCode)}${safeCode.length > 200 ? '\n<span class="code-ellipsis">...</span>' : ''}</div><pre class="code-collapsed-actual" style="display:none">${escapeHtml(safeCode)}</pre>`
      : `<pre class="code-inline">${escapeHtml(safeCode)}</pre>`;
    const toggleBtn = isLong
      ? `<button class="code-toggle-btn" onclick="toggleCodeBlock(this)"><i class="fa-solid fa-eye"></i> Expand</button>`
      : '';
    const langLabel = displayLang !== 'code' ? `<span class="code-lang-label">${escapeHtml(displayLang)}</span>` : '';
    return `<div class="code-block-collapsible">
  <div class="code-block-collapsible-header">
    <span class="code-block-file-name">${langLabel}</span>
    <div class="code-block-collapsible-actions">
      ${toggleBtn}
    </div>
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

// ─── Execution Panel Bridge ────────────────────────────────────────────────────

function execSetStep(num, status) {
  if (typeof window.updateStep === 'function') window.updateStep(num, status);
}
function execAddLog(type, message) {
  if (typeof window.addLog === 'function') window.addLog(type, message);
}
function execUpdateTools(tools) {
  if (typeof window.updateToolPanel === 'function') window.updateToolPanel(tools);
}

// ─── Code Block Toggle ─────────────────────────────────────────────────────────

function toggleCodeBlock(btn) {
  const block = btn.closest('.code-block-collapsible');
  if (!block) return;
  const body = block.querySelector('.code-block-collapsible-body');
  const preview = body.querySelector('.code-collapsed-preview');
  const actual = body.querySelector('.code-collapsed-actual');
  const isCollapsed = preview && preview.style.display !== 'none';

  if (isCollapsed) {
    if (preview) preview.style.display = 'none';
    if (actual) {
      actual.style.display = 'block';
      actual.style.marginTop = '0';
    }
    btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Collapse';
    btn.classList.add('collapsed');
  } else {
    if (preview) preview.style.display = 'block';
    if (actual) actual.style.display = 'none';
    btn.innerHTML = '<i class="fa-solid fa-eye"></i> Expand';
    btn.classList.remove('collapsed');
  }
}

// ─── Window Exports ─────────────────────────────────────────────────────────────
window.sendMessage         = sendMessage;
window.stopStreaming       = stopStreaming;
window.resetStreamState    = resetStreamState;
window.streamHandleEvent   = streamHandleEvent;
window.streamFinalize      = streamFinalize;
window.streamAppendError   = streamAppendError;
window.streamRenderCodeStart = streamRenderCodeStart;
window.streamCodeProgress  = streamCodeProgress;
window.streamCodeEnd       = streamCodeEnd;
window.streamCreateAssistantMessage = streamCreateAssistantMessage;
window.streamRenderThinking = streamRenderThinking;
window.streamToggleThinking = streamToggleThinking;
window.streamRenderText    = streamRenderText;
window.streamRenderAnalyzingState = streamRenderAnalyzingState;
window.appendUserMessage   = appendUserMessage;
window.appendAssistantMessage = appendAssistantMessage;
window.renderMarkdown      = renderMarkdown;
window.escapeHtml          = escapeHtml;
window.ensureConversation  = ensureConversation;
window.persistUserMessage  = persistUserMessage;
window.persistAssistantMessage = persistAssistantMessage;
window.getCurrentConversation = getCurrentConversation;
window.currentConversationId = null;
window.selectedSkillId     = '';
window.selectedKbIds       = new Set();
window.toggleCodeBlock    = toggleCodeBlock;
