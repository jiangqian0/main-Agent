/**
 * terminal-panel.js — 命令行终端面板
 *
 * Features:
 *   - Real-time streaming command output (stdout / stderr / info)
 *   - Color-coded output types
 *   - Command history with timing
 *   - Filter by type (stdout / stderr / all)
 *   - Auto-scroll with user scroll lock
 *   - Clear terminal
 *   - Copy output
 *
 * Integration:
 *   Called from chat-stream.js when tool_result events arrive:
 *     window.TerminalPanel.addCommand({ id, cmd, type: 'bash', startTime })
 *     window.TerminalPanel.appendOutput(id, { type: 'stdout|stderr|info', content })
 *     window.TerminalPanel.finishCommand(id, { exitCode, duration })
 *
 *   Or via custom events:
 *     window.dispatchEvent(new CustomEvent('terminal:command', { detail: { cmd, type }}));
 *     window.dispatchEvent(new CustomEvent('terminal:output', { detail: { type, content }}));
 *     window.dispatchEvent(new CustomEvent('terminal:finish', { detail: { exitCode }}));
 */

(function () {
  'use strict';

  // ─── State ─────────────────────────────────────────────────────────────────

  const _state = {
    commands: [],       // [{ id, cmd, type, startTime, exitCode, duration, done }]
    activeCmdId: null,
    isScrolling: true,
    filter: 'all',     // 'all' | 'stdout' | 'stderr' | 'info'
    maxLines: 2000,
    lineCount: 0,
    collapsedIds: new Set(),
  };

  // ─── DOM References ───────────────────────────────────────────────────────

  function getContainer() { return document.getElementById('tp-terminal-output'); }
  function getStatusEl() { return document.getElementById('tp-status'); }
  function getLineCountEl() { return document.getElementById('tp-line-count'); }
  function getFilterBtns() { return document.querySelectorAll('.tp-filter-btn'); }

  // ─── Render ───────────────────────────────────────────────────────────────

  function renderAll() {
    const container = getContainer();
    if (!container) return;
    container.innerHTML = '';

    _state.lineCount = 0;
    let visibleCount = 0;

    _state.commands.slice().reverse().forEach(function (cmd) {
      const html = renderCommand(cmd);
      container.insertAdjacentHTML('beforeend', html);
      if (!_state.filter || _state.filter === 'all' || cmd._hidden) {
        _state.lineCount += cmd._lineCount || 1;
        visibleCount++;
      }
    });

    updateLineCount();
    if (_state.isScrolling) scrollToBottom();
    updateStatus();
  }

  function renderCommand(cmd) {
    const isCollapsed = _state.collapsedIds.has(cmd.id);
    const exitIcon = cmd.done
      ? (cmd.exitCode === 0
        ? '<i class="fa-solid fa-check" style="color:#10b981"></i>'
        : '<i class="fa-solid fa-xmark" style="color:#ef4444"></i>')
      : '<i class="fa-solid fa-spinner fa-spin" style="color:#3b82f6"></i>';

    const exitLabel = cmd.done
      ? '<span class="tp-exit-code" style="color:' + (cmd.exitCode === 0 ? '#10b981' : '#ef4444') + '">' +
          (cmd.exitCode === undefined ? '' : '↵ ' + cmd.exitCode) + '</span>'
      : '<span class="tp-running-label">running...</span>';

    const iconMap = {
      bash: 'fa-terminal', shell: 'fa-terminal', sh: 'fa-terminal',
      git: 'fa-code-branch', python: 'fa-brands fa-python', node: 'fa-brands fa-node-js',
      npm: 'fa-brands fa-npm', pip: 'fa-brands fa-python', docker: 'fa-brands fa-docker',
      kubectl: 'fa-solid fa-dharmachakra', terraform: 'fa-brands fa-aws',
      tool: 'fa-gear', Read: 'fa-folder-open', search: 'fa-magnifying-glass',
      grep: 'fa-magnifying-glass', write_file: 'fa-file-lines',
      WebSearch: 'fa-globe', WebFetch: 'fa-globe',
      create_file: 'fa-file-circle-plus', Bash: 'fa-terminal'
    };
    const cmdIcon = iconMap[cmd.type] || 'fa-terminal';

    const duration = cmd.duration !== undefined
      ? '<span class="tp-duration">' + formatDuration(cmd.duration) + '</span>'
      : '';

    const outputs = cmd.outputs || [];
    let outputsHtml = '';
    if (!isCollapsed && outputs.length > 0) {
      outputs.forEach(function (out) {
        const show = _state.filter === 'all' || _state.filter === out.type;
        if (!show) return;
        const typeClass = out.type === 'stderr' ? 'tp-line-error' : out.type === 'info' ? 'tp-line-info' : '';
        const lineEsc = escHtml(out.content || '').replace(/\n/g, '<br>');
        outputsHtml += '<div class="tp-output-line ' + typeClass + '">' + lineEsc + '</div>';
      });
    } else if (!isCollapsed && outputs.length === 0 && !cmd.done) {
      outputsHtml = '<div class="tp-output-line tp-line-muted"><i class="fa-solid fa-ellipsis"></i></div>';
    }

    const collapsedToggle = outputs.length > 3
      ? '<button class="tp-collapse-btn" onclick="window.TerminalPanel.toggleCollapse(\'' + cmd.id + '\')">' +
          '<i class="fa-solid ' + (isCollapsed ? 'fa-caret-down' : 'fa-caret-up') + '"></i>' +
          (isCollapsed ? 'Show ' + outputs.length + ' lines' : 'Hide') +
        '</button>'
      : '';

    return '<div class="tp-command-block" id="tp-cmd-' + cmd.id + '">' +
      '<div class="tp-command-header" onclick="window.TerminalPanel.toggleCollapse(\'' + cmd.id + '\')">' +
        '<i class="fa-solid ' + cmdIcon + ' tp-cmd-icon"></i>' +
        '<span class="tp-cmd-text">' + escHtml(truncateCmd(cmd.cmd)) + '</span>' +
        exitIcon +
        exitLabel +
        duration +
        '<i class="fa-solid fa-chevron-' + (isCollapsed ? 'down' : 'up') + ' tp-collapse-chevron"></i>' +
      '</div>' +
      (collapsedToggle ? '<div class="tp-collapse-info">' + collapsedToggle + '</div>' : '') +
      '<div class="tp-command-outputs"' + (isCollapsed ? ' style="display:none"' : '') + '>' +
        outputsHtml +
      '</div>' +
    '</div>';
  }

  function truncateCmd(cmd) {
    if (!cmd) return '';
    if (cmd.length > 80) return cmd.slice(0, 77) + '...';
    return cmd;
  }

  function formatDuration(ms) {
    if (ms === undefined) return '';
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return Math.floor(ms / 60000) + 'm ' + ((ms % 60000) / 1000).toFixed(0) + 's';
  }

  // ─── Command Lifecycle ─────────────────────────────────────────────────────

  function addCommand(data) {
    const id = data.id || 'cmd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const cmd = {
      id: id,
      cmd: data.cmd || '',
      type: data.type || 'bash',
      startTime: data.startTime || Date.now(),
      exitCode: undefined,
      duration: undefined,
      done: false,
      outputs: [],
      _lineCount: 1,
    };
    _state.commands.push(cmd);
    _state.activeCmdId = id;
    appendCommandBlock(cmd);
    updateStatus();
    return id;
  }

  function appendCommandBlock(cmd) {
    const container = getContainer();
    if (!container) return;
    const html = renderCommand(cmd);
    container.insertAdjacentHTML('beforeend', html);
    if (_state.isScrolling) scrollToBottom();
  }

  function appendOutput(cmdId, data) {
    const cmd = _state.commands.find(function (c) { return c.id === cmdId; });
    if (!cmd) return;

    const out = { type: data.type || 'stdout', content: data.content || '' };
    cmd.outputs.push(out);
    cmd._lineCount = (cmd._lineCount || 1) + (out.content.match(/\n/g) || []).length + 1;

    const block = document.getElementById('tp-cmd-' + cmdId);
    if (!block) return;

    const outputsDiv = block.querySelector('.tp-command-outputs');
    if (!outputsDiv) return;

    const show = _state.filter === 'all' || _state.filter === out.type;
    if (show) {
      const lineEsc = escHtml(out.content || '').replace(/\n/g, '<br>');
      const typeClass = out.type === 'stderr' ? 'tp-line-error' : out.type === 'info' ? 'tp-line-info' : '';
      const lineEl = document.createElement('div');
      lineEl.className = 'tp-output-line ' + typeClass;
      lineEl.textContent = out.content;
      outputsDiv.appendChild(lineEl);
      _state.lineCount++;
      updateLineCount();
    }

    if (_state.isScrolling) scrollToBottom();

    // Trim old lines if over limit
    if (_state.lineCount > _state.maxLines) {
      trimOldLines();
    }
  }

  function finishCommand(cmdId, data) {
    const cmd = _state.commands.find(function (c) { return c.id === cmdId; });
    if (!cmd) return;

    cmd.done = true;
    cmd.exitCode = data.exitCode;
    cmd.duration = data.duration !== undefined ? data.duration : (Date.now() - cmd.startTime);

    const block = document.getElementById('tp-cmd-' + cmdId);
    if (!block) return;

    const header = block.querySelector('.tp-command-header');
    if (header) {
      // Update exit icon
      const existingIcons = header.querySelectorAll('.fa-check, .fa-xmark, .fa-spinner');
      existingIcons.forEach(function (el) { el.remove(); });

      const exitIcon = cmd.exitCode === 0
        ? '<i class="fa-solid fa-check" style="color:#10b981"></i>'
        : '<i class="fa-solid fa-xmark" style="color:#ef4444"></i>';

      const exitLabel = '<span class="tp-exit-code" style="color:' + (cmd.exitCode === 0 ? '#10b981' : '#ef4444') + '">↵ ' + cmd.exitCode + '</span>';
      const duration = '<span class="tp-duration">' + formatDuration(cmd.duration) + '</span>';

      header.insertAdjacentHTML('beforeend', exitIcon + exitLabel + duration);
    }

    // Remove running label
    const runningLabel = block.querySelector('.tp-running-label');
    if (runningLabel) runningLabel.remove();

    updateStatus();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function toggleCollapse(cmdId) {
    const block = document.getElementById('tp-cmd-' + cmdId);
    if (!block) return;

    const outputsDiv = block.querySelector('.tp-command-outputs');
    const chevron = block.querySelector('.tp-collapse-chevron');

    const isCollapsed = outputsDiv && outputsDiv.style.display === 'none';
    if (outputsDiv) outputsDiv.style.display = isCollapsed ? '' : 'none';
    if (chevron) {
      chevron.classList.remove('fa-chevron-up', 'fa-chevron-down');
      chevron.classList.add(isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down');
    }

    if (isCollapsed) {
      _state.collapsedIds.delete(cmdId);
    } else {
      _state.collapsedIds.add(cmdId);
    }
  }

  function trimOldLines() {
    // Remove oldest commands until under limit
    while (_state.lineCount > _state.maxLines && _state.commands.length > 1) {
      const removed = _state.commands.shift();
      _state.lineCount -= removed._lineCount || 1;
      const block = document.getElementById('tp-cmd-' + removed.id);
      if (block) block.remove();
    }
  }

  function setFilter(filter) {
    _state.filter = filter;
    getFilterBtns().forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderAll();
  }

  function clearTerminal() {
    _state.commands = [];
    _state.lineCount = 0;
    _state.activeCmdId = null;
    _state.collapsedIds.clear();
    const container = getContainer();
    if (container) container.innerHTML = '';
    updateLineCount();
    updateStatus();
    showTpToast('Terminal cleared');
  }

  function scrollToBottom() {
    const container = getContainer();
    if (container) container.scrollTop = container.scrollHeight;
  }

  function updateLineCount() {
    const el = getLineCountEl();
    if (el) el.textContent = _state.lineCount + ' lines';
  }

  function updateStatus() {
    const el = getStatusEl();
    if (!el) return;
    const running = _state.commands.filter(function (c) { return !c.done; }).length;
    if (running > 0) {
      el.innerHTML = '<i class="fa-solid fa-circle" style="color:#3b82f6;font-size:8px;animation:pulse 1s infinite"></i> ' + running + ' running';
    } else {
      el.innerHTML = '<i class="fa-solid fa-circle" style="color:#10b981;font-size:8px"></i> Idle';
    }
  }

  function copyAllOutput() {
    const text = _state.commands.map(function (cmd) {
      return '$ ' + cmd.cmd + '\n' + (cmd.outputs || []).map(function (o) { return o.content; }).join('');
    }).join('\n\n');
    navigator.clipboard.writeText(text).then(function () {
      showTpToast('Copied to clipboard!');
    }).catch(function () {});
  }

  function getActiveCmdId() {
    return _state.activeCmdId;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Toast ─────────────────────────────────────────────────────────────────

  function showTpToast(msg) {
    const container = document.getElementById('tp-toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'tp-toast';
    t.innerHTML = '<i class="fa-solid fa-check"></i>' + escHtml(msg);
    container.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  window.TerminalPanel = {
    addCommand: addCommand,
    appendOutput: appendOutput,
    finishCommand: finishCommand,
    toggleCollapse: toggleCollapse,
    setFilter: setFilter,
    clear: clearTerminal,
    copyAll: copyAllOutput,
    scrollToBottom: scrollToBottom,
    getActiveCmdId: getActiveCmdId,
    get state() { return _state; },
  };

  // Listen for custom events from other modules
  window.addEventListener('terminal:command', function (e) { addCommand(e.detail); });
  window.addEventListener('terminal:output', function (e) { appendOutput(e.detail.id || _state.activeCmdId, e.detail); });
  window.addEventListener('terminal:finish', function (e) { finishCommand(e.detail.id || _state.activeCmdId, e.detail); });

  // Scroll lock detection
  document.addEventListener('DOMContentLoaded', function () {
    var container = document.getElementById('tp-terminal-output');
    if (!container) return;
    container.addEventListener('scroll', function () {
      var atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      _state.isScrolling = atBottom;
    });
  });

})();
