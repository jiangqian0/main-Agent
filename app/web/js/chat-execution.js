/**
 * chat-execution.js — Execution panel module
 * 负责：Task Breakdown 步骤管理、Real-time Logs、Tool Results
 */

// Step state tracking
let stepStates = { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending' };

// ─── Step Management ──────────────────────────────────────────────────────────

function updateStep(num, status) {
  stepStates[num] = status;
  const item = document.querySelector(`.step-item[data-step="${num}"]`);
  if (!item) return;

  item.className = `step-item ${status}`;
  const icon = item.querySelector('.step-icon');
  if (!icon) return;

  icon.className = `step-icon ${status}`;
  const icons = {
    pending: 'fa-circle',
    running: 'fa-spinner fa-spin',
    completed: 'fa-check',
    error: 'fa-xmark'
  };
  icon.innerHTML = `<i class="fa-solid ${icons[status] || 'fa-circle'}"></i>`;
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
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

const LOG_ICONS = {
  info:    'fa-circle-info',
  success: 'fa-circle-check',
  warning: 'fa-triangle-exclamation',
  error:   'fa-circle-xmark'
};

function addLog(type, message) {
  const list = document.getElementById('logs-list');
  if (!list) return;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const icon = LOG_ICONS[type] || 'fa-circle';

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">${time}</span><i class="fa-solid ${icon} log-icon"></i><span class="log-message">${escapeHtml(message)}</span>`;
  list.appendChild(entry);
  list.parentElement.scrollTop = list.parentElement.scrollHeight;
}

// ─── Tool Results ─────────────────────────────────────────────────────────────
// updateToolPanel() — 仅更新 Tool Results 区域，不触碰 Logs 和 Steps

function updateToolPanel(tools) {
  if (!tools || !Array.isArray(tools)) return;

  const container = document.getElementById('tool-results-container');
  if (!container) return;

  container.innerHTML = '';

  for (const tr of tools) {
    const statusClass = tr.status === 'running' ? 'executing' : tr.success ? 'complete' : 'error';
    const spinHtml = tr.status === 'running'
      ? `<div class="tool-execution-spinner"></div>`
      : tr.success
        ? `<i class="fa-solid fa-check-circle tool-success-icon"></i>`
        : `<i class="fa-solid fa-circle-xmark tool-error-icon"></i>`;
    const timeLabel = tr.status === 'running' ? 'Running...' : tr.success ? 'Done' : 'Failed';

    const card = document.createElement('div');
    card.className = `tool-execution-card ${statusClass}`;
    card.innerHTML = `<div class="tool-execution-header">
      <div class="tool-execution-status">${spinHtml}<span class="tool-execution-message">${escapeHtml(tr.name)}</span></div>
      <span class="tool-execution-time">${timeLabel}</span>
    </div>`;

    if (tr.args && Object.keys(tr.args).length > 0) {
      const argsDiv = document.createElement('div');
      argsDiv.className = 'tool-execution-args';
      argsDiv.innerHTML = `<pre>${escapeHtml(JSON.stringify(tr.args, null, 2))}</pre>`;
      card.appendChild(argsDiv);
    }

    if (tr.result) {
      const resultDiv = document.createElement('div');
      resultDiv.className = 'tool-execution-result';
      resultDiv.innerHTML = `<pre>${escapeHtml(String(tr.result).slice(0, 300))}</pre>`;
      card.appendChild(resultDiv);
    }

    if (tr.error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'tool-execution-error';
      errorDiv.innerHTML = `<pre>${escapeHtml(tr.error)}</pre>`;
      card.appendChild(errorDiv);
    }

    container.appendChild(card);
  }
}

// ─── Window Exports ─────────────────────────────────────────────────────────────
window.resetExecutionState = resetExecutionState;
window.updateStep          = updateStep;
window.addLog             = addLog;
window.updateToolPanel    = updateToolPanel;
