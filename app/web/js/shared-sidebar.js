/**
 * shared-sidebar.js v2
 * 统一侧边栏逻辑，所有页面共享
 * 包含：侧边栏宽度拖拽、当前页面高亮、新对话按钮、历史记录管理、主题切换
 *
 * Usage:
 *   Include <script src="/static/js/shared-sidebar.js"></script>
 *   before your page-specific scripts.
 *
 * Sidebar structure expected in each HTML page:
 *   <div class="sidebar" id="sidebar">
 *     <div class="sidebar-resize-handle" id="sidebar-resize-handle"></div>
 *     <div class="sidebar-logo"> ... </div>
 *     <div class="sidebar-menu"> ... </div>
 *     <div class="sidebar-user"> ... </div>
 *   </div>
 */

(function () {
  'use strict';

  // ─── Sidebar Resize ─────────────────────────────────────────────────────────

  function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const handle = document.getElementById('sidebar-resize-handle');
    if (!handle) return;

    const savedWidth = localStorage.getItem('sidebar_width');
    if (savedWidth) {
      const w = parseInt(savedWidth, 10);
      if (w >= 200 && w <= 400) sidebar.style.width = w + 'px';
    }

    let isDragging = false, startX = 0, startWidth = 0;

    handle.addEventListener('mousedown', function (e) {
      isDragging = true;
      startX = e.clientX;
      startWidth = parseInt(sidebar.offsetWidth, 10) || 260;
      handle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      const newWidth = Math.min(400, Math.max(200, startWidth + (e.clientX - startX)));
      sidebar.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!isDragging) return;
      isDragging = false;
      handle.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem('sidebar_width', sidebar.offsetWidth);
    });
  }

  // ─── Active Menu Highlight ──────────────────────────────────────────────────

  function highlightActiveMenu() {
    const path = window.location.pathname;
    document.querySelectorAll('.sidebar .menu-item').forEach(function (item) {
      const href = item.getAttribute('href');
      if (!href) return;
      if (href === path || (href !== '/' && path.startsWith(href))) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // ─── New Chat Button ────────────────────────────────────────────────────────

  function initNewChatButton() {
    const btn = document.querySelector('.sidebar .btn-new-chat');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (window.location.pathname !== '/chat') {
        window.location.href = '/chat';
        return;
      }
      if (typeof window.newConversation === 'function') {
        window.newConversation();
      }
    });
  }

  // ─── Sidebar User Info ───────────────────────────────────────────────────────

  function initSidebarUser() {
    const usernameEl = document.getElementById('sidebar-username');
    if (!usernameEl) return;
    const savedUsername = localStorage.getItem('agent_username');
    if (savedUsername) usernameEl.textContent = savedUsername;
    const navUsername = document.getElementById('nav-username');
    if (navUsername && savedUsername) navUsername.textContent = savedUsername;
  }

  // ─── Theme Toggle ───────────────────────────────────────────────────────────

  function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;
    // Apply saved theme
    const theme = localStorage.getItem('agent_theme') || 'light';
    applyTheme(theme);

    toggleBtn.addEventListener('click', function () {
      const current = localStorage.getItem('agent_theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      localStorage.setItem('agent_theme', next);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      }
    }
  }

  // ─── History Management ───────────────────────────────────────────────────────

  const HISTORY_KEY = 'agent_conversations';

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  }

  function loadHistory() {
    // Only delegate to chat-storage.js on the chat page
    // Other pages should not render conversation history
    if (window.location.pathname === '/chat' && typeof window.loadConversations === 'function') {
      // chat-storage.js handles the full history rendering on chat page
      return;
    }

    // For non-chat pages or fallback, just render basic history
    const history = getHistory();
    const list = document.getElementById('history-list');
    if (!list) return;

    if (history.length === 0) {
      list.innerHTML = '<div class="empty-state"><p class="text-muted" style="padding:10px 16px;font-size:13px;">No conversations yet</p></div>';
      return;
    }

    list.innerHTML = history.map(function (item) {
      const date = item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '';
      return '<div class="history-item" data-id="' + item.id + '">' +
        '<div class="history-item-main">' +
          '<i class="fa-solid fa-message"></i>' +
          '<div class="history-item-content">' +
            '<div class="history-item-title">' + escapeHtml(item.title || 'New Chat') + '</div>' +
            '<div class="history-item-date">' + date + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="history-item-actions">' +
          '<button class="btn-edit" onclick="event.stopPropagation();window.renameConversation(\'' + item.id + '\')" title="Rename"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="btn-delete" onclick="event.stopPropagation();window.deleteConversation(\'' + item.id + '\')" title="Delete"><i class="fa-solid fa-trash"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function toggleHistory() {
    const list = document.getElementById('history-list');
    const toggle = document.getElementById('history-toggle');
    if (!list || !toggle) return;
    const isHidden = list.classList.contains('hidden');
    list.classList.toggle('hidden', isHidden);
    toggle.classList.toggle('expanded', isHidden);
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  function initLogout() {
    document.querySelectorAll('[onclick*="logout"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        localStorage.removeItem('agent_api_key');
        localStorage.removeItem('agent_username');
        localStorage.removeItem('agent_session');
        sessionStorage.removeItem('agent_session');
        window.location.href = '/login';
      });
    });
  }

  // ─── Notification Badge ─────────────────────────────────────────────────────

  function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
    badge.style.display = count > 0 ? '' : 'none';
  }

  // ─── Mobile Sidebar Toggle ──────────────────────────────────────────────────

  function initMobileToggle() {
    const toggle = document.getElementById('sidebar-mobile-toggle');
    const sidebar = document.getElementById('sidebar');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('mobile-open');
      toggle.classList.toggle('active');
    });

    // Close on overlay click
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('mobile-open');
        toggle.classList.remove('active');
      });
    }
  }

  // ─── Auth Check ─────────────────────────────────────────────────────────────

  function initAuthCheck() {
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    // Allow no redirect on login page
    if (!session && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }

  // ─── Sidebar Bottom Section ────────────────────────────────────────────────

  function updateSidebarBottom() {
    // Show/hide sidebar bottom items based on user session
    const el = document.getElementById('sidebar-bottom');
    if (!el) return;
    const session = localStorage.getItem('agent_session') || sessionStorage.getItem('agent_session');
    el.style.display = session ? '' : 'none';
  }

  // ─── Utils ─────────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  window.toggleHistory = toggleHistory;
  window.loadHistory = loadHistory;
  window.getHistory = getHistory;
  window.updateNotificationBadge = updateNotificationBadge;

  // ─── Init ───────────────────────────────────────────────────────────────────

  function init() {
    initSidebarResize();
    highlightActiveMenu();
    initNewChatButton();
    initSidebarUser();
    initThemeToggle();
    loadHistory();
    initLogout();
    initMobileToggle();
    updateSidebarBottom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
