/**
 * chat-stream.js — Streaming & rendering module
 * 负责：SSE 事件处理、消息创建、流式渲染、Thinking 区域、代码块
 */

const API_BASE_URL = '/api';

// getAttachmentContext may be defined in chat.js (loaded after this script)
// Provide a safe fallback so sendMessage doesn't crash on page load
if (typeof window.getAttachmentContext !== 'function') {
  window.getAttachmentContext = function() { return ''; };
}

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

// Plan mode state
window.currentMode = 'agent';      // 'agent' | 'plan' | 'ask'
window.planConfirmed = false;
window.pendingPlanMessage = '';    // 保留 Plan 阶段的用户消息用于确认后重发

// ─── Core: Send Request ───────────────────────────────────────────────────────

async function sendMessage() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg || isStreaming) return;
  const attachmentsContext = getAttachmentContext();
  const fullMessage = msg + (attachmentsContext ? attachmentsContext : '');

  input.value = '';
  input.style.height = 'auto';

  isStreaming = true;
  document.getElementById('welcome-message')?.remove();
  document.getElementById('send-btn')?.classList.add('loading');
  document.getElementById('stop-btn')?.classList.remove('hidden');
  switchRightPanel('execution');

  streamReset();
  resetStreamState();
  resetExecutionState();

  // 确保对话已创建（自动标题）- 异步执行
  ensureConversation(msg);

  // UI: 添加用户消息（显示原始消息，不含附件说明）
  appendUserMessage(msg, true);

  // 清空附件
  clearAttachments();

  // Plan 模式：先保存用户消息用于确认后重发
  if (window.currentMode === 'plan') {
    window.pendingPlanMessage = msg;
    // 等待对话创建完成后再保存
    setTimeout(() => persistPlanMessage(), 100);
  }

  // 立即创建助手消息占位符，显示 "分析中..." 状态
  streamState.$streamingMsg = streamCreateAssistantMessage();
  streamRenderAnalyzingState();

  // 更新右侧面板状态
  execSetStep(1, 'running');
  execSetStep(2, 'running');
  execAddLog('info', 'AI 正在分析请求...');

  // 自动匹配 Skill（同步等待，确保匹配完成后再发送）
  let effectiveSkillId = window.selectedSkillId || '';
  let skillName = null;

  if (!effectiveSkillId) {
    try {
      const resp = await fetch(`${API_BASE_URL}/skills/match?message=${encodeURIComponent(msg)}`);
      if (resp.ok) {
        const match = await resp.json();
        if (match && match.id) {
          effectiveSkillId = match.id;
          skillName = match.name || match.id;
          window.selectedSkillId = match.id;
        }
      }
    } catch (e) {
      console.warn('Skill match failed:', e);
    }
  } else {
    // 用户已手动选择技能
    skillName = document.getElementById('skill-btn-label')?.textContent || effectiveSkillId;
  }

  // 在 Execution Panel 显示使用的技能
  if (skillName) {
    execAddLog('info', `使用技能: ${skillName}`, 'skill-used');
  } else if (effectiveSkillId) {
    execAddLog('info', `技能: ${effectiveSkillId}`, 'skill-used');
  }

  abortController = new AbortController();
  await streamFetch(fullMessage, effectiveSkillId);
}

async function streamFetch(message, skillId, opts = {}) {
  const model = document.getElementById('model-select')?.value || 'qwen3-max';
  const kbIds = window.selectedKbIds.size > 0 ? [...window.selectedKbIds] : undefined;
  // Append answer style suffix from profile settings
  const styleSuffix = (typeof window.getAnswerStyleSuffix === 'function') ? window.getAnswerStyleSuffix() : '';
  const styledMessage = message + styleSuffix;

  // 获取认证token（从session对象中提取token字段）
  let authToken = '';
  const sessionStr = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
  if (sessionStr) {
    try {
      const sessionData = JSON.parse(sessionStr);
      authToken = sessionData.token || '';
    } catch (e) {
      authToken = sessionStr; // 兼容直接存储token的情况
    }
  }

  try {
    const resp = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
        message: styledMessage,
        conversation_id: window.currentConversationId ? String(window.currentConversationId) : null,
        skill_id: skillId || null,
        enable_tools: true,
        model: model || undefined,
        knowledge_bases: kbIds || [],
        mode: opts.mode || window.currentMode,
        plan_confirmed: opts.plan_confirmed || false,
        auth_token: authToken || undefined,
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
  streamState._switchedToTerminal = false;
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
      execSetStep(2, 'running');
      execUpdatePhase('thinking');
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
      execSetStep(4, 'running');
      execUpdatePhase('generating');
      break;

    case 'tool_call':
      execSetStep(3, 'running');
      execUpdatePhase('executing');

      // Auto-switch to terminal panel on first tool call
      if (!streamState._switchedToTerminal) {
        streamState._switchedToTerminal = true;
        switchRightPanel('terminal');
      }

      // Use tool_call_id as unique ID for deduplication
      const toolId = json.tool_call_id || json.tool;
      streamState.toolResults.push({
        name: json.tool,
        tool_call_id: json.tool_call_id,
        args: json.args || {},
        status: 'running',
        success: null,
        result: null,
        error: null,
        _id: toolId
      });
      execUpdateTools(streamState.toolResults);

      // Add to Terminal panel for visualization
      if (window.TerminalPanel) {
        let cmdText = json.tool;
        if (json.args) {
          if (json.args.file_path) {
            cmdText = `${json.tool}: ${json.args.file_path.split('/').pop().split('\\').pop()}`;
          } else if (json.args.command) {
            cmdText = `${json.tool}: ${json.args.command}`;
          } else if (json.args.path) {
            cmdText = `${json.tool}: ${json.args.path}`;
          } else if (json.args.query) {
            cmdText = `${json.tool}: ${json.args.query}`;
          }
        }
        const tpId = window.TerminalPanel.addCommand({
          id: 'tool-' + toolId,
          cmd: cmdText,
          type: 'tool',
          startTime: Date.now()
        });
        // Store the terminal panel id in the tool result
        const existingTr = streamState.toolResults.find(r => r.tool_call_id === json.tool_call_id || r._id === toolId);
        if (existingTr) existingTr._tpId = tpId;
      }

      // Only log if not a file write operation
      if (!['Write', 'write_file', 'create_file'].includes(json.tool)) {
        // Show brief description in log
        let logMsg = json.tool;
        if (json.args) {
          if (json.args.file_path) {
            const fileName = json.args.file_path.split('/').pop().split('\\').pop();
            logMsg = `${json.tool}: ${fileName}`;
          } else if (json.args.command) {
            const cmd = json.args.command.length > 50 ? json.args.command.substring(0, 50) + '...' : json.args.command;
            logMsg = `${json.tool}: ${cmd}`;
          }
        }
        execAddLog('tool', logMsg, 'tool-' + toolId);
      }
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

      // Show result in Terminal panel
      if (window.TerminalPanel) {
        const tpId = 'tool-' + (json.tool_call_id || json.tool);
        let resultContent = '';

        if (json.success && json.result) {
          // Show truncated result
          if (typeof json.result === 'string') {
            resultContent = json.result.length > 500
              ? json.result.substring(0, 500) + '\n... (truncated)'
              : json.result;
          } else if (typeof json.result === 'object') {
            resultContent = JSON.stringify(json.result, null, 2);
            if (resultContent.length > 500) {
              resultContent = resultContent.substring(0, 500) + '\n... (truncated)';
            }
          }
        } else if (json.error) {
          resultContent = 'Error: ' + json.error;
        }

        if (resultContent) {
          window.TerminalPanel.appendOutput(tpId, {
            type: json.success ? 'stdout' : 'stderr',
            content: resultContent
          });
        }

        window.TerminalPanel.finishCommand(tpId, {
          exitCode: json.success ? 0 : 1,
          duration: 0
        });
      }

      // Update the log entry with result status
      if (!['Write', 'write_file', 'create_file'].includes(json.tool)) {
        const toolId = json.tool_call_id || json.tool;
        const logId = 'tool-' + toolId;
        let logMsg = json.tool;
        if (json.args && json.args.file_path) {
          const fileName = json.args.file_path.split('/').pop().split('\\').pop();
          logMsg = `${json.tool}: ${fileName}`;
        }
        if (!json.success) {
          logMsg += ' (failed)';
        }
        execAddLog(json.success ? 'success' : 'error', logMsg, logId);
      }
      break;
    }

    case 'code_block_start':
      streamState.codeBlockActive = true;
      streamState.codeBlockBuffer = '';
      streamState.codeBlockInfo = {
        file_name: json.file_name,
        language: json.language,
        total_lines: json.total_lines,
        file_path: json.file_path
      };
      streamRenderCodeStart();
      execUpdatePhase('writing');
      execAddLog('info', `Writing: ${json.file_name}`);
      // Real-time sync to Code Panel
      if (window.CodePanel && json.file_name) {
        window.CodePanel.startFile(json.file_name, json.language || 'text');
      }
      break;

    case 'code_output':
      streamState.codeBlockBuffer += json.content || '';
      streamCodeProgress(json.progress, json.written, json.total);
      // Stream content to Code Panel as it arrives (for real-time preview)
      if (streamState.codeBlockActive && window.CodePanel && streamState.codeBlockInfo) {
        // Use appendContent for efficient streaming updates
        window.CodePanel.appendContent(streamState.codeBlockBuffer);
        // Also update the file directly for smooth preview
        const path = streamState.codeBlockInfo.file_name;
        if (path) {
          const file = window.CodePanel.getFile(path);
          if (file) {
            file.content = streamState.codeBlockBuffer;
            file.updatedAt = new Date().toISOString();
            // Incrementally update preview DOM
            const previewContainer = document.getElementById('cp-preview-area');
            if (previewContainer && window.CodePanel.state.selectedPath === path) {
              const body = previewContainer.querySelector('#cp-preview-body');
              if (body) {
                const lang = file.language || 'text';
                const lines = streamState.codeBlockBuffer.split('\n');
                const lineNumberWidth = String(lines.length).length;
                const linesHtml = lines.map(function (line, i) {
                  const num = String(i + 1).padStart(lineNumberWidth, ' ');
                  return '<div class="cp-code-line"><span class="cp-line-num">' + num + '</span><span class="cp-line-content">' + escapeHtml(line || ' ') + '</span></div>';
                }).join('');
                const container = body.querySelector('.cp-code-container');
                if (container) {
                  container.innerHTML = linesHtml;
                  container.className = 'cp-code-container lang-' + lang;
                }
                const footer = previewContainer.querySelector('.cp-preview-footer');
                if (footer) {
                  footer.innerHTML = '<span>' + lines.length + ' lines</span><span>' + streamState.codeBlockBuffer.length + ' chars</span><span>Streaming...</span>';
                }
              }
            }
          }
        }
      }
      break;

    case 'code_block_end':
      streamState.codeBlockActive = false;
      streamCodeEnd();
      if (streamState.codeBlockInfo && streamState.codeBlockBuffer) {
        const info = streamState.codeBlockInfo;
        const filePath = info.file_name || 'output.' + (info.language || 'txt');
        if (window.CodePanel) {
          window.CodePanel.addFile({
            path: filePath,
            content: streamState.codeBlockBuffer,
            language: info.language,
          });
        }
      }
      break;

    case 'bash_output':
    case 'bash_command':
      // Terminal panel integration
      if (window.TerminalPanel) {
        const cmdId = window.TerminalPanel.getActiveCmdId();
        if (cmdId) {
          window.TerminalPanel.appendOutput(cmdId, {
            type: json.type === 'bash_output' ? 'stdout' : 'info',
            content: json.content || json.command || '',
          });
        }
      }
      execAddLog('info', `Terminal: ${json.command || json.content}`);
      break;

    case 'terminal_start':
      if (window.TerminalPanel) {
        window.TerminalPanel.addCommand({
          cmd: json.command,
          type: json.tool || 'bash',
          startTime: json.startTime || Date.now(),
        });
      }
      execAddLog('info', `Executing: ${json.command}`);
      break;

    case 'terminal_output':
      if (window.TerminalPanel) {
        window.TerminalPanel.appendOutput(json.id || window.TerminalPanel.getActiveCmdId(), {
          type: json.stream === 'stderr' ? 'stderr' : 'stdout',
          content: json.content || '',
        });
      }
      break;

    case 'terminal_end':
      if (window.TerminalPanel) {
        window.TerminalPanel.finishCommand(json.id || window.TerminalPanel.getActiveCmdId(), {
          exitCode: json.exitCode,
          duration: json.duration,
        });
      }
      execAddLog(json.exitCode === 0 ? 'success' : 'error',
        `Command ${json.exitCode === 0 ? 'completed' : 'failed'} (exit ${json.exitCode})`);
      break;

    case 'done':
      streamOnDone();
      break;

    case 'workspace_refresh':
      if (window.CodePanel && json.files) {
        window.CodePanel.syncState(json.files);
      }
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

// 分析阶段的文字描述（循环显示）
const ANALYZING_STATES = [
  '正在理解你的需求',
  '正在匹配技能',
  '正在规划执行步骤',
  '正在读取工具定义',
  '正在构建提示词',
  '正在调用模型',
  '正在处理响应',
];

function streamRenderAnalyzingState() {
  const container = document.getElementById('chat-container');
  if (!container || !streamState.$streamingMsg) return;

  const msgBody = streamState.$streamingMsg.querySelector('.message-body');
  if (!msgBody) return;

  // 移除已有的 thinking / response 区域
  msgBody.querySelectorAll('.thinking-area, .response-area').forEach(el => el.remove());

  // 创建带状态指示器的分析中界面
  const html = `<div class="response-area analyzing-state">
    <div class="analyzing-indicator">
      <div class="analyzing-spinner">
        <div class="spinner-ring"></div>
        <div class="spinner-ring"></div>
        <div class="spinner-ring"></div>
      </div>
      <div class="analyzing-content">
        <span class="analyzing-status">AI 思考中</span>
        <span class="analyzing-text">正在分析请求</span>
      </div>
    </div>
    <div class="analyzing-progress">
      <div class="progress-dots">
        <span class="progress-dot"></span>
        <span class="progress-dot"></span>
        <span class="progress-dot"></span>
      </div>
    </div>
  </div>`;
  msgBody.insertAdjacentHTML('beforeend', html);
  container.scrollTop = container.scrollHeight;

  // 循环显示不同状态 + 点动画
  let stateIndex = 0;
  let dotCount = 0;
  streamState._analyzingTimer = setInterval(() => {
    const textEl = msgBody.querySelector('.analyzing-text');
    const statusEl = msgBody.querySelector('.analyzing-status');

    if (textEl) {
      dotCount++;
      const dots = dotCount % 4;
      textEl.textContent = ANALYZING_STATES[stateIndex] + '.'.repeat(dots);
    }

    // 每 2.5 秒切换一个状态
    if (dotCount % 5 === 0) {
      stateIndex = (stateIndex + 1) % ANALYZING_STATES.length;
    }

    // 更新右侧面板同步显示（如果右侧日志可见）
    const execLogsEl = msgBody.querySelector('.exec-scroll-wrapper');
    if (!execLogsEl) {
      // 同步到右侧面板
      if (window.execAddLog) {
        window.execAddLog('info', ANALYZING_STATES[stateIndex]);
      }
    }
  }, 500);
}

// ─── Stream Finalize ─────────────────────────────────────────────────────────

function streamFinalize() {
  isStreaming = false;
  abortController = null;
  document.getElementById('send-btn')?.classList.remove('loading');
  document.getElementById('stop-btn')?.classList.add('hidden');

  const text = streamState.textBuffer;
  console.log('[streamFinalize] text length:', text ? text.length : 0, 'streamingMsg:', !!streamState.$streamingMsg);

  // Plan 模式：流结束后显示确认栏，不直接持久化
  if (window.currentMode === 'plan' && !window.planConfirmed) {
    const confirmBar = document.getElementById('plan-confirm-bar');
    if (confirmBar) confirmBar.classList.add('visible');
    // 持久化 Plan 消息但不显示 "complete" 状态
    if (text) persistAssistantMessage(text);
    execSetStep(4, 'completed');
    execAddLog('success', 'Plan ready — review and confirm to execute');

    // 渲染 Markdown 格式
    if (streamState.$streamingMsg) {
      const msgBody = streamState.$streamingMsg.querySelector('.message-body');
      if (msgBody) {
        msgBody.querySelectorAll('.thinking-area').forEach(el => el.remove());
        let respArea = msgBody.querySelector('.response-area');
        if (respArea) {
          respArea.innerHTML = `<div class="markdown-content">${renderMarkdown(text)}</div>`;
        } else if (text) {
          respArea = document.createElement('div');
          respArea.className = 'response-area';
          respArea.innerHTML = `<div class="markdown-content">${renderMarkdown(text)}</div>`;
          msgBody.appendChild(respArea);
        }
      }
    }

    const container = document.getElementById('chat-container');
    if (container) container.scrollTop = container.scrollHeight;
    if (streamState.$streamingMsg) streamState.$streamingMsg.classList.remove('streaming');
    // 添加操作按钮
    if (streamState.$streamingMsg) {
      const msgContent = streamState.$streamingMsg.querySelector('.message-content');
      if (msgContent && !msgContent.querySelector('.message-actions')) {
        msgContent.insertAdjacentHTML('beforeend', `
          <div class="message-actions">
            <button class="msg-action-btn" onclick="retryLastMessage()" title="重新生成回复">
              <i class="fa-solid fa-rotate-right"></i>
            </button>
            <button class="msg-action-btn" onclick="copyMessageContent(this)" title="复制内容">
              <i class="fa-solid fa-copy"></i>
            </button>
          </div>
        `);
      }
    }
    streamState.$streamingMsg = null;
    return;
  }

  // Ask / Agent 模式：正常持久化
  if (text) {
    persistAssistantMessage(text);
  }

  // Ensure final markdown is rendered and thinking block is removed
  if (streamState.$streamingMsg) {
    const msgBody = streamState.$streamingMsg.querySelector('.message-body');
    if (msgBody) {
      msgBody.querySelectorAll('.thinking-area').forEach(el => el.remove());
      let respArea = msgBody.querySelector('.response-area');
      console.log('[streamFinalize] respArea exists:', !!respArea, 'text length:', text ? text.length : 0);
      if (respArea) {
        const rendered = `<div class="markdown-content">${renderMarkdown(text)}</div>`;
        console.log('[streamFinalize] Setting innerHTML, rendered length:', rendered.length);
        respArea.innerHTML = rendered;
      } else if (text) {
        respArea = document.createElement('div');
        respArea.className = 'response-area';
        respArea.innerHTML = `<div class="markdown-content">${renderMarkdown(text)}</div>`;
        msgBody.appendChild(respArea);
      }
    } else {
      console.log('[streamFinalize] No message body found!');
    }

    const msgContent = streamState.$streamingMsg.querySelector('.message-content');
    if (msgContent && !msgContent.querySelector('.message-actions')) {
      msgContent.insertAdjacentHTML('beforeend', `
        <div class="message-actions">
          <button class="msg-action-btn" onclick="retryLastMessage()" title="重新生成回复">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
          <button class="msg-action-btn" onclick="copyMessageContent(this)" title="复制内容">
            <i class="fa-solid fa-copy"></i>
          </button>
        </div>
      `);
    }
  } else {
    console.log('[streamFinalize] No streaming message element!');
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

  // Add streaming cursor animation indicator
  const cursorHtml = '<span class="thinking-cursor"></span>';
  const html = `<div class="thinking-area">
    <div class="thinking-area-header" onclick="streamToggleThinking(this.parentElement)">
      <div class="thinking-area-header-left">
        <div class="thinking-area-icon"><i class="fa-solid fa-brain"></i></div>
        <span class="thinking-area-label">Thinking</span>
        <span class="thinking-area-streaming">
          <span class="thinking-dots"></span>
        </span>
      </div>
      <div class="thinking-area-toggle ${streamState.thinkingExpanded ? 'expanded' : ''}">
        <i class="fa-solid fa-chevron-down"></i>
      </div>
    </div>
    <div class="thinking-area-body ${streamState.thinkingExpanded ? '' : 'hidden'}">
      <div class="thinking-area-content">${escapeHtml(streamState.thinkingBuffer)}${cursorHtml}</div>
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

// 简化的流式渲染（快速更新）
function streamRenderTextFast(text) {
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

  // 渲染回复区域（流式时使用简单 HTML）
  let responseEl = msgBody.querySelector('.response-area');
  if (!responseEl) {
    responseEl = document.createElement('div');
    responseEl.className = 'response-area';
    msgBody.appendChild(responseEl);
  }
  // 流式时只转义 HTML，不做完整 Markdown 渲染
  responseEl.innerHTML = `<div class="markdown-content">${escapeHtml(text)}</div><span class="cursor-blink"></span>`;

  container.scrollTop = container.scrollHeight;
}

function streamRenderText() {
  streamRenderTextFast(streamState.textBuffer);
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
    <div class="message-content">
      <div class="message-body"><div class="response-area"><div class="markdown-content">${renderMarkdown(content)}</div></div></div>
      <div class="message-actions">
        <button class="msg-action-btn" onclick="retryLastMessage()" title="重新生成回复">
          <i class="fa-solid fa-rotate-right"></i>
        </button>
        <button class="msg-action-btn" onclick="copyMessageContent(this)" title="复制内容">
          <i class="fa-solid fa-copy"></i>
        </button>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  if (persist) persistAssistantMessage(content);
}

// Retry last message
let lastUserMessage = '';

function retryLastMessage() {
  // Find the last user message in the current conversation
  const conv = getCurrentConversation();
  if (!conv || !conv.messages || conv.messages.length === 0) {
    showToast('没有可重试的消息', 'warning');
    return;
  }

  // Find last user message
  let lastUserMsg = null;
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role === 'user') {
      lastUserMsg = conv.messages[i].content;
      break;
    }
  }

  if (!lastUserMsg) {
    showToast('没有可重试的消息', 'warning');
    return;
  }

  // Remove the last assistant message if exists
  if (conv.messages.length > 0 && conv.messages[conv.messages.length - 1].role === 'assistant') {
    conv.messages.pop();
    saveConversations();
  }

  // Remove the last assistant message from UI
  const container = document.getElementById('chat-container');
  const messages = container.querySelectorAll('.message.assistant');
  if (messages.length > 0) {
    messages[messages.length - 1].remove();
  }

  // Re-send the message
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = lastUserMsg;
    input.dispatchEvent(new Event('input'));
  }

  // Trigger submit
  const form = document.querySelector('.chat-input-form');
  if (form) {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
}

function copyMessageContent(btn) {
  const msgContent = btn.closest('.message-content').querySelector('.markdown-content');
  if (!msgContent) return;

  const text = msgContent.innerText || msgContent.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板', 'success');
    // Brief visual feedback
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => {
      btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
    }, 1500);
  }).catch(() => {
    showToast('复制失败', 'error');
  });
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
function execUpdatePhase(phase) {
  if (typeof window.updatePhase === 'function') window.updatePhase(phase);
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
window.retryLastMessage = retryLastMessage;
window.copyMessageContent = copyMessageContent;

// Fallback showToast if not defined elsewhere
if (typeof window.showToast === 'undefined') {
  window.showToast = function(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : 'xmark'}"></i>${escapeHtml(msg)}`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  };
}

window.renderMarkdown      = renderMarkdown;
window.escapeHtml          = escapeHtml;
window.ensureConversation  = ensureConversation;
window.persistUserMessage  = persistUserMessage;
window.persistAssistantMessage = persistAssistantMessage;
window.getCurrentConversation = getCurrentConversation;
// 注意：不重置 currentConversationId，让它从 localStorage 恢复
window.selectedSkillId     = '';
window.selectedKbIds       = new Set();
window.toggleCodeBlock    = toggleCodeBlock;
