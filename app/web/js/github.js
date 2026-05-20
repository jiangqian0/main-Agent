/**
 * github.js — GitHub 同步模块
 *
 * Features:
 *   - Configure GitHub Token + Repo in Settings
 *   - Branch management (list, create, switch)
 *   - Commit with message
 *   - Push to remote
 *   - Sync status tracking
 *   - Auto-sync option
 *   - Sync history log
 *
 * Integration:
 *   - Listens for 'github:sync_file' events from CodePanel
 *   - Exposes window.GitHubSync API for UI calls
 *   - Settings stored in localStorage (encrypted token recommended)
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    token: 'gh_token',
    repo: 'gh_repo',
    branch: 'gh_branch',
    autoSync: 'gh_auto_sync',
    syncHistory: 'gh_sync_history',
  };

  // ─── State ─────────────────────────────────────────────────────────────────

  const _state = {
    token: localStorage.getItem(STORAGE_KEYS.token) || '',
    repo: localStorage.getItem(STORAGE_KEYS.repo) || '',
    branch: localStorage.getItem(STORAGE_KEYS.branch) || 'main',
    autoSync: localStorage.getItem(STORAGE_KEYS.autoSync) === 'true',
    syncHistory: [],
    isPushing: false,
    branches: [],
    branchesLoaded: false,
  };

  try {
    _state.syncHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.syncHistory) || '[]');
  } catch (e) { _state.syncHistory = []; }

  // ─── GitHub API ───────────────────────────────────────────────────────────

  function ghHeaders() {
    return {
      'Authorization': 'Bearer ' + _state.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }

  function parseRepo(repo) {
    // Accepts: "owner/repo" or "https://github.com/owner/repo"
    if (!repo) return null;
    const m = repo.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
    if (m) return { owner: m[1], repo: m[2].replace('.git', '') };
    if (repo.includes('/')) {
      const parts = repo.split('/');
      return { owner: parts[0], repo: parts[1].replace('.git', '') };
    }
    return null;
  }

  async function ghFetch(path, options) {
    const parsed = parseRepo(_state.repo);
    if (!parsed) throw new Error('Invalid repository format. Use "owner/repo".');
    const url = 'https://api.github.com' + path.replace('{owner}', parsed.owner).replace('{repo}', parsed.repo);
    const resp = await fetch(url, { ...options, headers: { ...ghHeaders(), ...(options.headers || {}) } });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || 'GitHub API error: ' + resp.status);
    }
    if (resp.status === 204) return null;
    return resp.json();
  }

  // ─── Config ────────────────────────────────────────────────────────────────

  function isConfigured() {
    return !!(_state.token && _state.repo);
  }

  function saveConfig(config) {
    if (config.token !== undefined) {
      _state.token = config.token;
      localStorage.setItem(STORAGE_KEYS.token, config.token);
    }
    if (config.repo !== undefined) {
      _state.repo = config.repo;
      localStorage.setItem(STORAGE_KEYS.repo, config.repo);
    }
    if (config.branch !== undefined) {
      _state.branch = config.branch;
      localStorage.setItem(STORAGE_KEYS.branch, config.branch);
    }
    if (config.autoSync !== undefined) {
      _state.autoSync = config.autoSync;
      localStorage.setItem(STORAGE_KEYS.autoSync, String(config.autoSync));
    }
    showGhToast('Configuration saved');
  }

  function getConfig() {
    return {
      token: _state.token ? '••••••••' + _state.token.slice(-4) : '',
      repo: _state.repo,
      branch: _state.branch,
      autoSync: _state.autoSync,
    };
  }

  // ─── Branch Operations ─────────────────────────────────────────────────────

  async function loadBranches() {
    if (!isConfigured()) return [];
    try {
      const data = await ghFetch('/repos/{owner}/{repo}/branches?per_page=100');
      _state.branches = Array.isArray(data) ? data.map(function (b) { return b.name; }) : [];
      _state.branchesLoaded = true;
      return _state.branches;
    } catch (e) {
      showGhToast('Failed to load branches: ' + e.message, 'error');
      return [];
    }
  }

  async function createBranch(name, fromBranch) {
    if (!isConfigured()) throw new Error('GitHub not configured');
    const from = fromBranch || _state.branch || 'main';
    try {
      // Get SHA of source branch
      const refData = await ghFetch('/repos/{owner}/{repo}/git/ref/heads/' + encodeURIComponent(from));
      const sha = refData.object.sha;

      // Create new branch
      await ghFetch('/repos/{owner}/{repo}/git/refs', {
        method: 'POST',
        body: JSON.stringify({
          ref: 'refs/heads/' + name,
          sha: sha,
        }),
      });

      _state.branch = name;
      localStorage.setItem(STORAGE_KEYS.branch, name);
      showGhToast('Branch "' + name + '" created from ' + from);
      return name;
    } catch (e) {
      showGhToast('Failed to create branch: ' + e.message, 'error');
      throw e;
    }
  }

  async function switchBranch(name) {
    _state.branch = name;
    localStorage.setItem(STORAGE_KEYS.branch, name);
    showGhToast('Switched to branch: ' + name);
  }

  // ─── Commit & Push ────────────────────────────────────────────────────────

  async function commitAndPush(files, message) {
    if (!isConfigured()) throw new Error('GitHub not configured');
    if (!message) message = generateCommitMessage(files);

    _state.isPushing = true;
    dispatchGhStatus('pushing', 'Pushing to GitHub...');

    const parsed = parseRepo(_state.repo);
    if (!parsed) throw new Error('Invalid repo');

    const results = [];

    for (const file of files) {
      try {
        const result = await pushSingleFile(parsed, file.path, file.content, message);
        results.push({ path: file.path, status: 'success', result: result });
        addSyncHistory({ type: 'commit', path: file.path, branch: _state.branch, message: message, success: true });
      } catch (e) {
        results.push({ path: file.path, status: 'error', error: e.message });
        addSyncHistory({ type: 'commit', path: file.path, branch: _state.branch, message: message, success: false, error: e.message });
      }
    }

    _state.isPushing = false;
    dispatchGhStatus('idle', 'Idle');
    return results;
  }

  async function pushSingleFile(parsed, filePath, content, commitMessage) {
    const branch = _state.branch;
    const encodedPath = encodeURIComponent(filePath);

    // Check if file exists
    let sha = undefined;
    try {
      const existing = await ghFetch('/repos/{owner}/{repo}/contents/' + encodedPath + '?ref=' + branch);
      sha = existing.sha;
    } catch (e) {
      // File doesn't exist, that's fine
    }

    // Create/update blob
    const contentBase64 = btoa(unescape(encodeURIComponent(content)));

    const body = {
      message: commitMessage,
      content: contentBase64,
      branch: branch,
    };
    if (sha) body.sha = sha;

    const result = await ghFetch('/repos/{owner}/{repo}/contents/' + encodedPath, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    return result;
  }

  async function syncWorkspace() {
    if (!isConfigured()) {
      showGhToast('Please configure GitHub in Settings', 'error');
      return;
    }

    // Get all workspace files from CodePanel
    const files = window.CodePanel ? window.CodePanel.getFiles() : [];
    if (files.length === 0) {
      showGhToast('No files to sync', 'error');
      return;
    }

    const message = 'chore: sync workspace files via Agent Hub (' + new Date().toLocaleString() + ')';
    return commitAndPush(files, message);
  }

  // ─── Commit Message Generation ─────────────────────────────────────────────

  function generateCommitMessage(files) {
    if (files.length === 0) return 'chore: sync files';
    if (files.length === 1) {
      const ext = files[0].path.split('.').pop();
      return 'feat(' + ext + '): update ' + files[0].path;
    }
    return 'feat: sync ' + files.length + ' files';
  }

  // ─── Sync History ─────────────────────────────────────────────────────────

  function addSyncHistory(entry) {
    _state.syncHistory.unshift({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    if (_state.syncHistory.length > 50) _state.syncHistory = _state.syncHistory.slice(0, 50);
    localStorage.setItem(STORAGE_KEYS.syncHistory, JSON.stringify(_state.syncHistory));
  }

  function getSyncHistory() {
    return _state.syncHistory;
  }

  function clearSyncHistory() {
    _state.syncHistory = [];
    localStorage.setItem(STORAGE_KEYS.syncHistory, '[]');
  }

  // ─── Status Dispatch ───────────────────────────────────────────────────────

  function dispatchGhStatus(status, message) {
    window.dispatchEvent(new CustomEvent('github:status', { detail: { status: status, message: message } }));
  }

  // ─── Toast ─────────────────────────────────────────────────────────────────

  function showGhToast(msg, type) {
    var container = document.getElementById('gh-toast-container');
    if (!container) return;
    var t = document.createElement('div');
    t.className = 'gh-toast ' + (type || '');
    t.innerHTML = '<i class="fa-solid fa-' + (type === 'error' ? 'xmark' : 'github') + '"></i>' + escHtml(msg);
    container.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── GitHub Settings UI Helpers ────────────────────────────────────────────

  function renderGitHubSettings(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var branches = _state.branches.length > 0
      ? '<option value="">Current: ' + escHtml(_state.branch) + '</option>' +
        _state.branches.map(function (b) { return '<option value="' + escHtml(b) + '">' + escHtml(b) + '</option>'; }).join('')
      : '<option value="">Load branches first</option>';

    container.innerHTML =
      '<div class="gh-settings-section">' +
        '<h3><i class="fa-brands fa-github"></i> GitHub Configuration</h3>' +
        '<div class="form-group">' +
          '<label>Personal Access Token</label>' +
          '<input type="password" id="gh-token" value="' + escHtml(_state.token ? "••••••••" + _state.token.slice(-4) : '') + '" placeholder="ghp_..." autocomplete="off">' +
          '<p class="form-hint">Needs repo scope. <a href="https://github.com/settings/tokens" target="_blank">Generate here</a></p>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Repository</label>' +
          '<input type="text" id="gh-repo" value="' + escHtml(_state.repo) + '" placeholder="owner/repository">' +
        '</div>' +
        '<div class="form-row-2">' +
          '<div class="form-group">' +
            '<label>Branch</label>' +
            '<select id="gh-branch">' + branches + '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label>&nbsp;</label>' +
            '<button class="btn btn-outline" onclick="window.GitHubSync.loadBranches()" style="margin-top:4px"><i class="fa-solid fa-rotate"></i> Refresh</button>' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="gh-toggle-label">' +
            '<input type="checkbox" id="gh-auto-sync" ' + (_state.autoSync ? 'checked' : '') + '>' +
            'Auto-sync workspace on task completion' +
          '</label>' +
        '</div>' +
        '<div class="gh-settings-actions">' +
          '<button class="btn btn-outline" onclick="window.GitHubSync.testConnection()"><i class="fa-solid fa-plug"></i> Test Connection</button>' +
          '<button class="btn btn-primary" onclick="window.GitHubSync.saveFromUI()"><i class="fa-solid fa-save"></i> Save</button>' +
        '</div>' +
      '</div>' +

      '<div class="gh-settings-section">' +
        '<h3><i class="fa-solid fa-code-branch"></i> Branches</h3>' +
        '<div class="gh-branch-list" id="gh-branch-list">' +
          (_state.branches.length > 0
            ? _state.branches.map(function (b) {
                return '<div class="gh-branch-item' + (b === _state.branch ? ' active' : '') + '" onclick="window.GitHubSync.switchBranch(\'' + escHtml(b) + '\')">' +
                  '<i class="fa-solid fa-code-branch"></i>' +
                  '<span>' + escHtml(b) + '</span>' +
                  (b === _state.branch ? '<i class="fa-solid fa-check" style="color:var(--primary)"></i>' : '') +
                '</div>';
              }).join('')
            : '<p style="color:var(--grey);font-size:13px;">No branches loaded. Click "Refresh" to load.</p>') +
        '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px;">' +
          '<input type="text" id="gh-new-branch" placeholder="new-branch-name" style="flex:1">' +
          '<button class="btn btn-outline" onclick="window.GitHubSync.createBranchFromUI()"><i class="fa-solid fa-plus"></i> Create</button>' +
        '</div>' +
      '</div>' +

      '<div class="gh-settings-section">' +
        '<h3><i class="fa-solid fa-clock-rotate-left"></i> Sync History</h3>' +
        '<div class="gh-sync-history" id="gh-sync-history">' +
          renderSyncHistory() +
        '</div>' +
      '</div>' +

      '<div class="gh-settings-section">' +
        '<h3><i class="fa-solid fa-rocket"></i> Quick Sync</h3>' +
        '<p style="font-size:13px;color:var(--grey);margin-bottom:10px;">Sync all workspace files to GitHub in one click.</p>' +
        '<button class="btn btn-primary" onclick="window.GitHubSync.syncWorkspace()" ' + (isConfigured() ? '' : 'disabled') + '>' +
          '<i class="fa-brands fa-github"></i> Sync All Files' +
        '</button>' +
        (!isConfigured() ? '<p style="color:#ef4444;font-size:12px;margin-top:6px;">Configure GitHub above first</p>' : '') +
      '</div>';
  }

  function renderSyncHistory() {
    var hist = _state.syncHistory;
    if (hist.length === 0) return '<p style="color:var(--grey);font-size:13px;">No sync history yet.</p>';
    return hist.slice(0, 10).map(function (h) {
      var icon = h.success
        ? '<i class="fa-solid fa-check" style="color:#10b981"></i>'
        : '<i class="fa-solid fa-xmark" style="color:#ef4444"></i>';
      var time = formatTime(h.timestamp);
      return '<div class="gh-history-item">' + icon + ' <code>' + escHtml(h.path) + '</code> on <strong>' +
        escHtml(h.branch) + '</strong> <span style="color:var(--grey)">' + time + '</span></div>';
    }).join('');
  }

  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var diff = Date.now() - d;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    return d.toLocaleDateString();
  }

  // UI-triggered actions
  function saveFromUI() {
    var token = document.getElementById('gh-token').value.trim();
    var repo = document.getElementById('gh-repo').value.trim();
    var branch = document.getElementById('gh-branch').value.trim();
    var autoSync = document.getElementById('gh-auto-sync').checked;
    if (!token || token.startsWith('••')) {
      token = _state.token; // Keep existing if masked
    }
    saveConfig({ token: token, repo: repo, branch: branch, autoSync: autoSync });
  }

  async function testConnection() {
    if (!isConfigured()) {
      showGhToast('Please save token and repo first', 'error');
      return;
    }
    try {
      var user = await ghFetch('/user');
      showGhToast('Connected as ' + (user.login || user.name || 'GitHub user'));
    } catch (e) {
      showGhToast('Connection failed: ' + e.message, 'error');
    }
  }

  async function createBranchFromUI() {
    var input = document.getElementById('gh-new-branch');
    var name = input ? input.value.trim() : '';
    if (!name) return;
    try {
      await createBranch(name);
      await loadBranches();
      renderGitHubSettings('gh-settings-container');
    } catch (e) { /* toast already shown */ }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  window.GitHubSync = {
    isConfigured: isConfigured,
    saveConfig: saveConfig,
    getConfig: getConfig,
    loadBranches: loadBranches,
    createBranch: createBranch,
    switchBranch: switchBranch,
    commitAndPush: commitAndPush,
    syncWorkspace: syncWorkspace,
    getSyncHistory: getSyncHistory,
    clearSyncHistory: clearSyncHistory,
    renderSettings: renderGitHubSettings,
    saveFromUI: saveFromUI,
    testConnection: testConnection,
    createBranchFromUI: createBranchFromUI,
    get state() { return _state; },
  };

  // Listen for file sync requests from CodePanel
  window.addEventListener('github:sync_file', function (e) {
    if (!_state.autoSync) return;
    var file = e.detail;
    if (file && file.path) {
      commitAndPush([{ path: file.path, content: file.content }], 'chore: sync ' + file.path);
    }
  });

})();
