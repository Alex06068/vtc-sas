/**
 * Courses dashboard: enrolled courses as cards, plus join / create actions.
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

  /* ---------------- rendering ---------------- */

  function load() {
    UI.setState(statusEl, 'loading', 'Loading your courses…');
    return window.Api.getCourses()
      .then(function (data) {
        state.courses = N.asList(data).map(N.normalizeCourse);
        countEl.textContent = String(state.courses.length);
        render();
        UI.setState(
          statusEl,
          state.courses.length ? null : 'empty',
          'You are not enrolled in any course yet. Use "Join a course" and enter the course code from your teacher.'
        );
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        countEl.textContent = '0';
        UI.setState(statusEl, 'error', (err && err.message) || 'Could not load your courses.', load);
      });
  }

  function render() {
    grid.innerHTML = state.courses.map(function (course) {
      const accent = UI.courseAccent(course.code);
      const href = 'course.html' + (course.id !== undefined && course.id !== null
        ? '?id=' + encodeURIComponent(course.id)
        : '');
      return (
        '<a class="course-card" href="' + href + '" style="--accent:' + accent + '">' +
          '<div class="course-card-body">' +
            '<span class="course-code">' + UI.escapeHtml(course.code || 'NO CODE') + '</span>' +
            '<h2 class="course-name">' + UI.escapeHtml(course.name) + '</h2>' +
            (course.description
              ? '<p class="course-desc">' + UI.escapeHtml(course.description) + '</p>'
              : '') +
          '</div>' +
          '<div class="course-card-foot">' +
            '<span>Open course</span>' +
            '<span class="course-link">View content &rarr;</span>' +
          '</div>' +
        '</a>'
      );
    }).join('');
  }

  /* ---------------- dialog helpers ---------------- */

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
      btn.textContent = busyText || 'Please wait…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  /* ---------------- join a course ---------------- */

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
        showFormError(joinError, 'Please enter a course code.');
        joinCode.focus();
        return;
      }

      setBusy(joinSubmit, true, 'Joining…');
      window.Api.joinCourse(code)
        .then(function () {
          UI.toast('Joined ' + code);
          closeDialog(joinDialog);
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          showFormError(joinError, (err && err.message) || 'Could not join that course. Check the course code.');
        })
        .finally(function () {
          setBusy(joinSubmit, false);
        });
    });
  }

  /* ---------------- create a course (teachers) ---------------- */

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
        showFormError(createError, 'Course code and course name are both required.');
        return;
      }

      setBusy(createSubmit, true, 'Creating…');
      window.Api.createCourse({ code: code, name: name, description: description || undefined })
        .then(function () {
          // The creator is not enrolled automatically, so join right after.
          return window.Api.joinCourse(code).catch(function () { /* already enrolled: ignore */ });
        })
        .then(function () {
          UI.toast('Course "' + name + '" created');
          closeDialog(createDialog);
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          showFormError(createError, (err && err.message) || 'Could not create the course.');
        })
        .finally(function () {
          setBusy(createSubmit, false);
        });
    });
  }

  /* ---------------- start ---------------- */

  UI.initNavbar().then(function (user) {
    if (user && user.role === 'teacher') {
      UI.show(createBtn);
    }
  });

  load();
})();
