/**
 * 课程 Dashboard：显示已加入的课程（卡片布局），支持加入课程 / 教师创建课程。
 */
(function () {
  'use strict';

  if (!window.VtcUI.requireAuth()) return;

  const UI = window.VtcUI;
  const N = window.VtcNormalize;

  const grid = document.getElementById('courses-grid');
  const statusEl = document.getElementById('courses-status');
  const countEl = document.getElementById('course-count');
  const joinBtn = document.getElementById('join-course-btn');
  const createBtn = document.getElementById('create-course-btn');

  const joinDialog = document.getElementById('join-dialog');
  const joinForm = document.getElementById('join-form');
  const joinCode = document.getElementById('join-code');
  const joinError = document.getElementById('join-error');
  const joinSubmit = document.getElementById('join-submit');

  const createDialog = document.getElementById('create-dialog');
  const createForm = document.getElementById('create-form');
  const createCode = document.getElementById('create-code');
  const createName = document.getElementById('create-name');
  const createDesc = document.getElementById('create-desc');
  const createError = document.getElementById('create-error');
  const createSubmit = document.getElementById('create-submit');

  const state = { courses: [] };

  /* ---------------- 渲染 ---------------- */

  function load() {
    UI.setState(statusEl, 'loading', '正在加载课程…');
    return window.Api.getCourses()
      .then(function (data) {
        state.courses = N.asList(data).map(N.normalizeCourse);
        countEl.textContent = String(state.courses.length);
        render();
        UI.setState(
          statusEl,
          state.courses.length ? null : 'empty',
          '还没有加入任何课程。点击右上角「加入课程」，输入教师提供的课程代码即可加入。'
        );
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        countEl.textContent = '0';
        UI.setState(statusEl, 'error', (err && err.message) || '课程加载失败，请稍后重试。', load);
      });
  }

  function render() {
    grid.innerHTML = state.courses.map(function (course) {
      const accent = UI.courseAccent(course.code);
      const href = 'assignments.html' + (course.id !== undefined && course.id !== null
        ? '?course=' + encodeURIComponent(course.id)
        : '');
      return (
        '<a class="course-card" href="' + href + '" style="--accent:' + accent + '">' +
          '<div class="course-card-body">' +
            '<span class="course-code">' + UI.escapeHtml(course.code || '无代码') + '</span>' +
            '<h2 class="course-name">' + UI.escapeHtml(course.name) + '</h2>' +
            (course.description
              ? '<p class="course-desc">' + UI.escapeHtml(course.description) + '</p>'
              : '') +
          '</div>' +
          '<div class="course-card-foot">' +
            '<span>课程作业</span>' +
            '<span class="course-link">查看作业 →</span>' +
          '</div>' +
        '</a>'
      );
    }).join('');
  }

  /* ---------------- 弹窗工具 ---------------- */

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

  function showFormError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
  }

  function hideFormError(el) {
    if (!el) return;
    el.classList.remove('show');
    el.textContent = '';
  }

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = busyText || '请稍候…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  /* ---------------- 加入课程 ---------------- */

  if (joinBtn) {
    joinBtn.addEventListener('click', function () {
      hideFormError(joinError);
      joinCode.value = '';
      openDialog(joinDialog);
      window.setTimeout(function () { joinCode.focus(); }, 30);
    });
  }

  bindDialog(joinDialog);

  if (joinForm) {
    joinForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hideFormError(joinError);

      const code = joinCode.value.trim();
      if (!code) {
        showFormError(joinError, '请输入课程代码。');
        joinCode.focus();
        return;
      }

      setBusy(joinSubmit, true, '加入中…');
      window.Api.joinCourse(code)
        .then(function () {
          UI.toast('已加入课程 ' + code);
          closeDialog(joinDialog);
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          showFormError(joinError, (err && err.message) || '加入课程失败，请检查课程代码。');
        })
        .finally(function () {
          setBusy(joinSubmit, false);
        });
    });
  }

  /* ---------------- 创建课程（教师） ---------------- */

  bindDialog(createDialog);

  if (createBtn) {
    createBtn.addEventListener('click', function () {
      hideFormError(createError);
      createForm.reset();
      openDialog(createDialog);
      window.setTimeout(function () { createCode.focus(); }, 30);
    });
  }

  if (createForm) {
    createForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hideFormError(createError);

      const code = createCode.value.trim();
      const name = createName.value.trim();
      const description = createDesc.value.trim();

      if (!code || !name) {
        showFormError(createError, '课程代码和课程名称都不能为空。');
        return;
      }

      setBusy(createSubmit, true, '创建中…');
      window.Api.createCourse({ code: code, name: name, description: description || undefined })
        .then(function () {
          // 创建者默认不会自动加入，这里顺手加入，课程才会出现在「我的课程」里。
          return window.Api.joinCourse(code).catch(function () { /* 已加入等情况忽略 */ });
        })
        .then(function () {
          UI.toast('课程「' + name + '」已创建');
          closeDialog(createDialog);
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          showFormError(createError, (err && err.message) || '创建课程失败。');
        })
        .finally(function () {
          setBusy(createSubmit, false);
        });
    });
  }

  /* ---------------- 启动 ---------------- */

  UI.initNavbar().then(function (user) {
    if (user && user.role === 'teacher') {
      UI.show(createBtn);
    }
  });

  load();
})();
