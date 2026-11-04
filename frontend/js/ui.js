/**
 * 通用 UI 工具：DOM 选择、转义、toast、状态占位、导航栏、登录守卫。
 * 依赖 api.js（window.Api）。
 */
(function () {
  'use strict';

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 轻提示，3.2 秒后自动消失。 */
  function toast(message, type) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const item = document.createElement('div');
    item.className = 'toast ' + (type === 'error' ? 'error' : 'success');
    item.textContent = message;
    stack.appendChild(item);
    window.setTimeout(function () {
      item.remove();
      if (!stack.childElementCount) stack.remove();
    }, 3200);
  }

  /**
   * 状态占位区。
   * @param {HTMLElement} el
   * @param {'loading'|'error'|'empty'|null} state  null = 隐藏
   * @param {string} message
   * @param {Function} [onRetry]
   */
  function setState(el, state, message, onRetry) {
    if (!el) return;
    if (!state) {
      el.classList.remove('show');
      el.innerHTML = '';
      return;
    }
    el.classList.add('show');

    if (state === 'loading') {
      el.innerHTML =
        '<div class="spinner"></div>' +
        '<div class="state-title">加载中…</div>' +
        (message ? '<div class="state-message">' + escapeHtml(message) + '</div>' : '');
      return;
    }

    const icons = { error: '⚠️', empty: '📭' };
    const titles = { error: '加载失败', empty: '暂无数据' };
    el.innerHTML =
      '<div class="state-icon">' + (icons[state] || '') + '</div>' +
      '<div class="state-title">' + (titles[state] || '') + '</div>' +
      '<div class="state-message">' + escapeHtml(message || '') + '</div>';

    if (state === 'error' && typeof onRetry === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = '重新加载';
      btn.addEventListener('click', onRetry);
      el.appendChild(btn);
    }
  }

  /** 根据课程代码从调色板里挑一个强调色，让每张课程卡片有一点区别。 */
  function courseAccent(code) {
    const palette = ['#0f6cbf', '#0b7a75', '#6f42c1', '#c05621', '#2b7a4b', '#b02a37', '#0b6e99', '#8a4f9e'];
    const text = String(code || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  /**
   * 初始化顶部导航：显示用户名/角色、绑定退出登录。
   * @returns {Promise<{username?:string, role?:string}|null>}
   */
  async function initNavbar() {
    const usernameEl = document.getElementById('nav-username');
    const roleEl = document.getElementById('nav-role');
    const logoutBtn = document.getElementById('logout-btn');

    const cached = window.Api ? window.Api.getUser() : null;
    if (cached) {
      if (usernameEl) usernameEl.textContent = cached.username || '';
      if (roleEl) roleEl.textContent = cached.role === 'teacher' ? '教师' : (cached.role === 'student' ? '学生' : (cached.role || ''));
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (window.Api) window.Api.clearSession();
        window.location.replace('login.html');
      });
    }

    try {
      const me = await window.Api.me();
      if (me && me.username) {
        if (usernameEl) usernameEl.textContent = me.username;
        if (roleEl) roleEl.textContent = me.role === 'teacher' ? '教师' : (me.role === 'student' ? '学生' : (me.role || ''));
        window.Api.setUser({ username: me.username, role: me.role });
        return me;
      }
    } catch (err) {
      // 401 时 api.js 已经清了会话并跳转登录页；其它错误允许页面继续用缓存显示。
      if (err && err.status === 401) return null;
    }
    return cached || null;
  }

  /** 登录守卫：没有 token 就跳登录页。返回是否通过。 */
  function requireAuth() {
    if (!window.Api || !window.Api.getToken()) {
      window.location.replace('login.html');
      return false;
    }
    return true;
  }

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  window.VtcUI = {
    qs: qs,
    qsa: qsa,
    escapeHtml: escapeHtml,
    toast: toast,
    setState: setState,
    courseAccent: courseAccent,
    initNavbar: initNavbar,
    requireAuth: requireAuth,
    show: show,
    hide: hide
  };
})();
