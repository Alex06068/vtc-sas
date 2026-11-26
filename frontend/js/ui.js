/**
 * Shared UI helpers: DOM selection, escaping, toasts, state placeholders,
 * navbar wiring, auth guard and the collapsible course sections.
 * Requires api.js (window.Api).
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

  /** Toast, auto-dismisses after 3.2 seconds. */
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
   * State placeholder.
   * @param {HTMLElement} el
   * @param {'loading'|'error'|'empty'|null} state  null hides the box
   * @param {string} message
   * @param {Function} [onRetry]
   */
  function setState(el, state, message, onRetry, actions) {
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
        '<div class="state-title">Loading…</div>' +
        (message ? '<div class="state-message">' + escapeHtml(message) + '</div>' : '');
      return;
    }

    const icons = { error: '⚠️', empty: '📭' };
    const titles = { error: 'Something went wrong', empty: 'Nothing here yet' };
    el.innerHTML =
      '<div class="state-icon">' + (icons[state] || '') + '</div>' +
      '<div class="state-title">' + (titles[state] || '') + '</div>' +
      '<div class="state-message">' + escapeHtml(message || '') + '</div>';

    if (state === 'error' && typeof onRetry === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = 'Try again';
      btn.addEventListener('click', onRetry);
      el.appendChild(btn);
    }

    const extra = Array.isArray(actions) ? actions : (Array.isArray(onRetry) ? onRetry : null);
    if (extra) {
      extra.forEach(function (action) {
        if (!action || !action.label) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = action.className || 'btn btn-primary btn-sm';
        btn.textContent = action.label;
        if (typeof action.onClick === 'function') {
          btn.addEventListener('click', action.onClick);
        }
        el.appendChild(btn);
      });
    }
  }

  /** Stable accent colour per course code, so cards stay recognisable. */
  function courseAccent(code) {
    const palette = ['#0f6cbf', '#0b7a75', '#6f42c1', '#c05621', '#2b7a4b', '#b02a37', '#0b6e99', '#8a4f9e'];
    const text = String(code || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  function roleLabel(role) {
    if (role === 'teacher') return 'Teacher';
    if (role === 'student') return 'Student';
    return role || '';
  }

  /**
   * Wire the top navigation: show the user, bind sign out.
   * @returns {Promise<{username?:string, role?:string}|null>}
   */
  async function initNavbar() {
    const usernameEl = document.getElementById('nav-username');
    const roleEl = document.getElementById('nav-role');
    const logoutBtn = document.getElementById('logout-btn');

    const cached = window.Api ? window.Api.getUser() : null;
    if (cached) {
      if (usernameEl) usernameEl.textContent = cached.username || '';
      if (roleEl) roleEl.textContent = roleLabel(cached.role);
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
        if (roleEl) roleEl.textContent = roleLabel(me.role);
        window.Api.setUser({ id: me.id, username: me.username, role: me.role });
        return me;
      }
    } catch (err) {
      // api.js already redirects on 401; other errors fall back to the cache.
      if (err && err.status === 401) return null;
    }
    return cached || null;
  }

  /** Auth guard: redirects to the login page when no token is stored. */
  function requireAuth() {
    if (!window.Api || !window.Api.getToken()) {
      window.location.replace('login.html');
      return false;
    }
    return true;
  }

  /** Make every .section collapsible; returns an "expand all" function. */
  function initSections() {
    const sections = qsa('.section');

    sections.forEach(function (section) {
      const head = section.querySelector('.section-head');
      if (!head) return;

      const setOpen = function (open) {
        section.dataset.open = String(open);
        head.setAttribute('aria-expanded', String(open));
        head.setAttribute('role', 'button');
        head.setAttribute('tabindex', '0');
      };

      setOpen(section.dataset.open !== 'false');

      const toggle = function () {
        setOpen(section.dataset.open !== 'true');
      };

      head.addEventListener('click', toggle);
      head.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });

    return function expandAll() {
      sections.forEach(function (section) {
        section.dataset.open = 'true';
        const head = section.querySelector('.section-head');
        if (head) head.setAttribute('aria-expanded', 'true');
      });
    };
  }

  /** Simple visual tab switching for pages that do not have real tab routes. */
  function initTabs() {
    const tabs = qsa('.tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (other) {
          other.classList.remove('is-active');
          other.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
      });
    });
  }

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function bindDialog(dialog) {
    if (!dialog) return;
    dialog.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeDialog(dialog); });
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  window.VtcUI = {
    qs: qs,
    qsa: qsa,
    escapeHtml: escapeHtml,
    toast: toast,
    setState: setState,
    courseAccent: courseAccent,
    roleLabel: roleLabel,
    initNavbar: initNavbar,
    requireAuth: requireAuth,
    initSections: initSections,
    initTabs: initTabs,
    show: show,
    hide: hide,
    openDialog: openDialog,
    closeDialog: closeDialog,
    bindDialog: bindDialog
  };
})();
