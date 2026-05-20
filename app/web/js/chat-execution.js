/**
 * chat-execution.js — Execution panel module
 * 负责：Task Breakdown 步骤管理、Real-time Logs、Tool Results
 */

// Step state tracking
let stepStates = { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending' };
let currentPhase = '';

// Track seen tools to avoid duplicate logs
let seenToolCalls = new Set();

// Phase descriptions for better UX
const PHASE_INFO = {
  'thinking': { step: 2, label: 'AI 思考中', icon: 'fa-brain' },
  'executing': { step: 3, label: '执行工具', icon: 'fa-gear' },
  'writing': { step: 3, label: '写入文件', icon: 'fa-file-code' },
  'reading': { step: 3, label: '读取文件', icon: 'fa-folder-open' },
  'searching': { step: 3, label: '搜索中', icon: 'fa-magnifying-glass' },
  'generating': { step: 4, label: '生成回复', icon: 'fa-pen' },
};

// ─── Phase Updates ──────────────────────────────────────────────────────────

function updatePhase(phase) {
  currentPhase = phase;
  const info = PHASE_INFO[phase];
  if (!info) return;

  // Update step 3 (Processing Request) to show current phase
  const step3Item = document.querySelector('.step-item[data-step="3"]');
  if (step3Item) {
    const textEl = step3Item.querySelector('.step-text');
    const iconEl = step3Item.querySelector('.step-icon i');
    if (textEl) textEl.textContent = info.label;
    if (iconEl) iconEl.className = `fa-solid ${info.icon}`;
  }
}

// ─── Step Management ──────────────────────────────────────────────────────────

function updateStep(num, status, customLabel) {
  stepStates[num] = status;
  const item = document.querySelector(`.step-item[data-step="${num}"]`);
  if (!item) return;

  item.className = `step-item ${status}`;
  const icon = item.querySelector('.step-icon');
  const textEl = item.querySelector('.step-text');
  if (!icon) return;

  icon.className = `step-icon ${status}`;
  const icons = {
    pending: 'fa-circle',
    running: 'fa-spinner fa-spin',
    completed: 'fa-check',
    error: 'fa-xmark'
  };
  icon.innerHTML = `<i class="fa-solid ${icons[status] || 'fa-circle'}"></i>`;

  // Update label if custom label provided
  if (customLabel && textEl) {
    textEl.textContent = customLabel;
  }
}

function resetExecutionState() {
  // Reset step display in the HTML (the panel body)
  document.querySelectorAll('.step-item').forEach(item => {
    const num = parseInt(item.dataset.step || '0');
    stepStates[num] = 'pending';
    const icon = item.querySelector('.step-icon');
    item.className = 'step-item pending';
    if (icon) {
      icon.className = 'step-icon pending';
      icon.innerHTML = '<i class="fa-solid fa-circle"></i>';
    }
  });

  // Clear logs (but keep container)
  const ll = document.getElementById('logs-list');
  if (ll) ll.innerHTML = '';

  // Clear tool results
  const trContainer = document.getElementById('tool-results-container');
  if (trContainer) trContainer.innerHTML = '';

  // Clear terminal panel
  if (window.TerminalPanel) {
    window.TerminalPanel.clear();
  }

  // Reset tool tracking
  seenToolCalls = new Set();
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

const LOG_ICONS = {
  info:    'fa-circle-info',
  success: 'fa-circle-check',
  warning: 'fa-triangle-exclamation',
  error:   'fa-circle-xmark',
  tool:    'fa-gear',
  file:    'fa-file-code',
  terminal: 'fa-terminal',
  skill:   'fa-wand-magic-sparkles'
};

function addLog(type, message, id) {
  const list = document.getElementById('logs-list');
  if (!list) return;

  // Avoid duplicate logs (by id or by message content)
  if (id) {
    const existing = document.getElementById('log-' + id);
    if (existing) {
      // Update existing log instead of adding new one
      existing.querySelector('.log-message').textContent = message;
      const iconMap = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' };
      const iconEl = existing.querySelector('.log-icon');
      if (iconMap[type] && iconEl) {
        iconEl.className = `fa-solid ${iconMap[type]} log-icon`;
      }
      existing.className = `log-entry ${type}`;
      list.scrollTop = list.scrollHeight;
      return;
    }
  }

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const icon = LOG_ICONS[type] || 'fa-circle';

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  if (id) entry.id = 'log-' + id;
  entry.innerHTML = `<span class="log-time">${time}</span><i class="fa-solid ${icon} log-icon"></i><span class="log-message">${escapeHtml(message)}</span>`;
  list.appendChild(entry);
  list.parentElement.scrollTop = list.parentElement.scrollHeight;
}

// ─── Tool Results ─────────────────────────────────────────────────────────────

function updateToolPanel(tools) {
  if (!tools || !Array.isArray(tools)) return;

  const container = document.getElementById('tool-results-container');
  if (!container) return;

  container.innerHTML = '';

  for (const tr of tools) {
    const isRunning = tr.status === 'running';
    const isSuccess = !isRunning && (tr.success !== false);
    const isError = !isRunning && (tr.success === false);

    const statusClass = isRunning ? 'executing' : isSuccess ? 'complete' : 'error';
    const spinHtml = isRunning
      ? `<div class="tool-execution-spinner"></div>`
      : isSuccess
        ? `<i class="fa-solid fa-check-circle tool-success-icon"></i>`
        : `<i class="fa-solid fa-circle-xmark tool-error-icon"></i>`;
    const timeLabel = isRunning ? 'Running...' : isSuccess ? 'Done' : 'Failed';

    // Tool name with icon
    const toolIcons = {
      'Read': 'fa-folder-open',
      'write_file': 'fa-file-lines',
      'Write': 'fa-file-lines',
      'create_file': 'fa-file-circle-plus',
      'Bash': 'fa-terminal',
      'bash': 'fa-terminal',
      'search': 'fa-magnifying-glass',
      'grep': 'fa-magnifying-glass',
      'Read_multiple_files': 'fa-folder-tree',
      'NotebookEdit': 'fa-book',
      'NotebookRead': 'fa-book',
      'WebSearch': 'fa-globe',
      'WebFetch': 'fa-globe'
    };
    const toolIcon = toolIcons[tr.name] || 'fa-gear';

    // Show a brief description
    let desc = '';
    if (tr.args) {
      if (tr.args.file_path) desc = tr.args.file_path.split('/').pop().split('\\').pop();
      else if (tr.args.command) desc = tr.args.command.length > 40 ? tr.args.command.substring(0, 40) + '...' : tr.args.command;
      else if (tr.args.query) desc = tr.args.query;
    }

    const card = document.createElement('div');
    card.className = `tool-execution-card ${statusClass}`;

    const statusColor = isRunning ? '#3b82f6' : isSuccess ? '#10b981' : '#ef4444';
    const statusBg = isRunning ? 'rgba(59,130,246,0.08)' : isSuccess ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';

    card.innerHTML = `
      <div class="tool-result-header">
        <div class="tool-result-icon" style="background:${statusBg};color:${statusColor};">
          <i class="fa-solid ${toolIcon}"></i>
        </div>
        <div class="tool-result-info">
          <div class="tool-result-name">${escapeHtml(tr.name)}</div>
          ${desc ? `<div class="tool-result-desc">${escapeHtml(desc)}</div>` : ''}
        </div>
        <div class="tool-result-status">
          ${spinHtml}
          <span class="tool-result-label" style="color:${statusColor};">${timeLabel}</span>
        </div>
      </div>`;

    container.appendChild(card);
  }
}

// ─── Window Exports ─────────────────────────────────────────────────────────────
window.resetExecutionState = resetExecutionState;
window.updateStep          = updateStep;
window.updatePhase          = updatePhase;
window.addLog             = addLog;
window.updateToolPanel    = updateToolPanel;
