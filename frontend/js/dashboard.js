/**
 * Courses home: due work for this week, course cards, plus join / create actions.
 */
(function () {
  'use strict';

  if (!window.VtcUI.requireAuth()) return;

  const UI = window.VtcUI;
  const N = window.VtcNormalize;

  const grid = document.getElementById('courses-grid');
  const statusEl = document.getElementById('courses-status');
  const dueWeek = document.getElementById('due-week');
  const dueList = document.getElementById('due-list');
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
  const createStart = document.getElementById('create-start');
  const createEnd = document.getElementById('create-end');
  const createError = document.getElementById('create-error');
  const createSubmit = document.getElementById('create-submit');

  const state = { courses: [], tasks: [], user: null, isTeacher: false };

  /* ---------------- helpers ---------------- */

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

  function courseById(id) {
    return state.courses.find(function (course) {
      return String(course.id) === String(id);
    });
  }

  function dueTime(task) {
    if (!task.due) return Infinity;
    const due = new Date(task.due);
    return Number.isNaN(due.getTime()) ? Infinity : due.getTime();
  }

  function tasksForCourse(courseId) {
    return state.tasks.filter(function (task) {
      return task.courseId != null && String(task.courseId) === String(courseId);
    });
  }

  function nextTaskForCourse(courseId) {
    return tasksForCourse(courseId)
      .filter(function (task) { return !task.completed && task.due; })
      .sort(function (a, b) { return dueTime(a) - dueTime(b); })[0] || null;
  }

  function progressForCourse(courseId) {
    const list = tasksForCourse(courseId);
    if (!list.length) return 0;
    const done = list.filter(function (task) { return task.completed; }).length;
    return Math.round((done / list.length) * 100);
  }

  /* ---------------- rendering ---------------- */

  function renderDueWork() {
    if (!dueWeek || !dueList) return;

    const upcoming = state.tasks
      .filter(function (task) { return !task.completed && task.due; })
      .sort(function (a, b) { return dueTime(a) - dueTime(b); })
      .slice(0, 5);

    if (!upcoming.length) {
      dueWeek.hidden = true;
      dueList.innerHTML = '';
      return;
    }

    dueList.innerHTML = upcoming.map(function (task) {
      const phrase = N.duePhrase(task.due);
      const course = courseById(task.courseId);
      const code = course && course.code ? UI.escapeHtml(course.code) : '';
      const href = task.courseId != null
        ? 'course.html?id=' + encodeURIComponent(task.courseId)
        : 'assignments.html';
      return (
        '<li>' +
          '<span><a href="' + href + '">' + UI.escapeHtml(task.title) + '</a>' +
          (code ? '<span class="due-course">' + code + '</span>' : '') +
          '</span>' +
          '<span class="due-when' + (phrase.kind === 'overdue' || phrase.kind === 'soon' ? ' is-' + phrase.kind : '') + '">' +
            UI.escapeHtml(phrase.text) +
          '</span>' +
        '</li>'
      );
    }).join('');
    dueWeek.hidden = false;
  }

  function renderCards() {
    grid.innerHTML = state.courses.map(function (course) {
      const href = 'course.html' + (course.id !== undefined && course.id !== null
        ? '?id=' + encodeURIComponent(course.id)
        : '');
      const next = nextTaskForCourse(course.id);
      let nextHtml;
      let nextClass = 'course-next';
      if (next) {
        const phrase = N.duePhrase(next.due);
        nextHtml = UI.escapeHtml(next.title) + ' · ' + UI.escapeHtml(phrase.text);
        if (phrase.kind === 'soon' || phrase.kind === 'overdue') nextClass += ' is-' + phrase.kind;
      } else if (state.isTeacher) {
        nextHtml = 'No upcoming work. Add a week on the course page when you are ready.';
      } else {
        nextHtml = 'No upcoming work';
      }
      const pct = progressForCourse(course.id);
      return (
        '<a class="course-card" href="' + href + '">' +
          '<div class="course-card-body">' +
            '<span class="course-code">' + UI.escapeHtml(course.code || 'No code') + '</span>' +
            '<h2 class="course-name">' + UI.escapeHtml(course.name) + '</h2>' +
            '<p class="' + nextClass + '">' + nextHtml + '</p>' +
            '<div class="progress-track is-thin" aria-label="Progress ' + pct + ' percent">' +
              '<div class="progress-fill" style="width:' + pct + '%"></div>' +
            '</div>' +
          '</div>' +
        '</a>'
      );
    }).join('');
  }

  function renderEmpty() {
    const message = state.isTeacher
      ? 'You have no courses yet. Create a course to get started, then add week 1 on the course page.'
      : 'You are not enrolled in any course yet. Join a course with the code from your teacher.';
    const actions = state.isTeacher
      ? [
          { label: 'Create a course', onClick: function () { openCreate(); } },
          { label: 'Join a course', className: 'btn btn-secondary btn-sm', onClick: function () { openJoin(); } }
        ]
      : [{ label: 'Join a course', onClick: function () { openJoin(); } }];
    UI.setState(statusEl, 'empty', message, null, actions);
  }

  function load() {
    UI.setState(statusEl, 'loading', 'Loading your courses…');
    return Promise.all([
      window.Api.getCourses(),
      window.Api.getTasks().catch(function () { return []; })
    ])
      .then(function (results) {
        state.courses = N.asList(results[0]).map(N.normalizeCourse);
        state.tasks = N.asList(results[1]).map(N.normalizeTask);
        renderDueWork();
        renderCards();
        if (state.courses.length) {
          UI.setState(statusEl, null);
        } else {
          renderEmpty();
        }
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        if (dueWeek) dueWeek.hidden = true;
        UI.setState(statusEl, 'error', (err && err.message) || 'Could not load your courses.', load);
      });
  }

  /* ---------------- dialogs ---------------- */

  function openJoin() {
    hideFormError(joinError);
    joinCode.value = '';
    UI.openDialog(joinDialog);
    window.setTimeout(function () { joinCode.focus(); }, 30);
  }

  function openCreate() {
    hideFormError(createError);
    createForm.reset();
    UI.openDialog(createDialog);
    window.setTimeout(function () { createCode.focus(); }, 30);
  }

  UI.bindDialog(joinDialog);
  UI.bindDialog(createDialog);

  if (joinBtn) joinBtn.addEventListener('click', openJoin);
  if (createBtn) createBtn.addEventListener('click', openCreate);

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
          UI.closeDialog(joinDialog);
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

  if (createForm) {
    createForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hideFormError(createError);

      const code = createCode.value.trim();
      const name = createName.value.trim();
      const description = createDesc.value.trim();
      const startDate = createStart && createStart.value ? createStart.value : undefined;
      const endDate = createEnd && createEnd.value ? createEnd.value : undefined;

      if (!code || !name) {
        showFormError(createError, 'Course code and course name are both required.');
        return;
      }

      const payload = { code: code, name: name };
      if (description) payload.description = description;
      if (startDate) payload.start_date = startDate;
      if (endDate) payload.end_date = endDate;

      setBusy(createSubmit, true, 'Creating…');
      window.Api.createCourse(payload)
        .then(function (course) {
          const id = course && (course.id || course.course_id);
          UI.toast('Course "' + name + '" created');
          if (id != null) {
            window.location.href = 'course.html?id=' + encodeURIComponent(id);
            return;
          }
          UI.closeDialog(createDialog);
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

  const cached = window.Api.getUser();
  if (cached && cached.role === 'teacher') {
    state.isTeacher = true;
    UI.show(createBtn);
  }

  UI.initNavbar().then(function (user) {
    state.user = user;
    state.isTeacher = !!(user && user.role === 'teacher');
    if (state.isTeacher) UI.show(createBtn);
    else UI.hide(createBtn);
  });

  load();
})();
