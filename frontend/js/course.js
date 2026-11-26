/**
 * Course page: summary, weeks/topics (teachers can add and edit), and assignments.
 * Reads the course id from ?id=<course id>.
 */
(function () {
  'use strict';

  if (!window.VtcUI.requireAuth()) return;

  const UI = window.VtcUI;
  const N = window.VtcNormalize;

  const titleEl = document.getElementById('course-title');
  const metaEl = document.getElementById('course-meta');
  const crumbEl = document.getElementById('crumb-course');
  const descEl = document.getElementById('course-description');
  const termEl = document.getElementById('course-term');
  const modulesEl = document.getElementById('modules-list');
  const weeksEmpty = document.getElementById('weeks-empty');
  const tasksEl = document.getElementById('tasks-list');
  const statusEl = document.getElementById('course-status');
  const progressValue = document.getElementById('progress-value');
  const progressFill = document.getElementById('progress-fill');
  const allAssignmentsLink = document.getElementById('all-assignments-link');
  const teacherActions = document.getElementById('teacher-actions');
  const editCourseBtn = document.getElementById('edit-course-btn');
  const addWeekBtn = document.getElementById('add-week-btn');

  const editDialog = document.getElementById('edit-course-dialog');
  const editForm = document.getElementById('edit-course-form');
  const editError = document.getElementById('edit-course-error');
  const editCode = document.getElementById('edit-code');
  const editName = document.getElementById('edit-name');
  const editDesc = document.getElementById('edit-desc');
  const editStart = document.getElementById('edit-start');
  const editEnd = document.getElementById('edit-end');
  const editSubmit = document.getElementById('edit-course-submit');

  const weekDialog = document.getElementById('week-dialog');
  const weekForm = document.getElementById('week-form');
  const weekError = document.getElementById('week-error');
  const weekTitle = document.getElementById('week-dialog-title');
  const weekId = document.getElementById('week-id');
  const weekName = document.getElementById('week-title');
  const weekNumber = document.getElementById('week-number');
  const weekDate = document.getElementById('week-date');
  const weekContent = document.getElementById('week-content');
  const weekLinks = document.getElementById('week-links');
  const weekSubmit = document.getElementById('week-submit');

  const state = { course: null, modules: [], tasks: [], user: null, canEdit: false };

  let courseId = null;
  try {
    courseId = new URLSearchParams(window.location.search).get('id');
  } catch (e) {
    courseId = null;
  }

  /* ---------------- small helpers ---------------- */

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

  function isoDate(value) {
    if (!value) return '';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseLinkLines(text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      const raw = line.trim();
      if (!raw) return null;
      const parts = raw.split('|');
      if (parts.length >= 2) {
        const url = parts.slice(1).join('|').trim();
        const title = parts[0].trim();
        if (!url) return null;
        return { title: title || url, url: url };
      }
      return { title: raw, url: raw };
    }).filter(Boolean);
  }

  function linksToText(links) {
    return (links || []).map(function (item) {
      if (!item || !item.url) return '';
      if (item.title && item.title !== item.url) return item.title + ' | ' + item.url;
      return item.url;
    }).filter(Boolean).join('\n');
  }

  function weekHeading(module) {
    if (module.weekNumber != null && module.weekNumber !== '') {
      return 'Week ' + module.weekNumber;
    }
    return '';
  }

  /* ---------------- rendering ---------------- */

  function updateProgress(tasks) {
    if (!progressValue || !progressFill) return;
    if (!tasks.length) {
      progressValue.textContent = '0%';
      progressFill.style.width = '0%';
      return;
    }
    const done = tasks.filter(function (task) { return task.completed; }).length;
    const pct = Math.round((done / tasks.length) * 100);
    progressValue.textContent = pct + '%';
    progressFill.style.width = pct + '%';
  }

  function renderCourse(course) {
    document.title = course.name + ' · VTC-SAS';
    titleEl.textContent = course.name;
    const bits = [];
    if (course.code) bits.push('<strong>' + UI.escapeHtml(course.code) + '</strong>');
    metaEl.innerHTML = bits.join(' ') || '';
    crumbEl.textContent = course.code || course.name;
    descEl.textContent = course.description || 'No description has been added to this course yet.';
    if (termEl) {
      if (course.startDate || course.endDate) {
        const start = course.startDate ? N.formatDate(course.startDate) : '—';
        const end = course.endDate ? N.formatDate(course.endDate) : '—';
        termEl.textContent = 'Term: ' + start + ' – ' + end;
        termEl.hidden = false;
      } else {
        termEl.hidden = true;
        termEl.textContent = '';
      }
    }
    if (allAssignmentsLink) {
      allAssignmentsLink.href = 'assignments.html' + (course.id != null ? '?course=' + encodeURIComponent(course.id) : '');
    }
    if (state.canEdit) UI.show(teacherActions);
    else UI.hide(teacherActions);
  }

  function renderWeeks(modules) {
    if (!modules.length) {
      modulesEl.innerHTML = '';
      const message = state.canEdit
        ? 'This course has no weeks yet. Add week 1 to get started.'
        : 'This course has no weeks yet.';
      const actions = state.canEdit
        ? [{ label: 'Add week 1', onClick: function () { openWeekDialog(null); } }]
        : null;
      UI.setState(weeksEmpty, 'empty', message, null, actions);
      return;
    }

    UI.setState(weeksEmpty, null);
    modulesEl.innerHTML = modules.map(function (module) {
      const label = weekHeading(module);
      const dateLabel = module.startDate ? N.formatDate(module.startDate) : '';
      const body = [];
      if (module.content) {
        body.push('<p>' + UI.escapeHtml(module.content) + '</p>');
      }
      if (module.links && module.links.length) {
        body.push(
          '<ul class="week-links">' +
            module.links.map(function (link) {
              const href = UI.escapeHtml(link.url);
              const title = UI.escapeHtml(link.title || link.url);
              return '<li><a href="' + href + '" target="_blank" rel="noopener noreferrer">' + title + '</a></li>';
            }).join('') +
          '</ul>'
        );
      }
      const actions = state.canEdit
        ? '<div class="week-actions">' +
            '<button type="button" class="text-action" data-edit-week="' + UI.escapeHtml(String(module.id)) + '">Edit</button>' +
            '<button type="button" class="text-action danger" data-delete-week="' + UI.escapeHtml(String(module.id)) + '">Delete</button>' +
          '</div>'
        : '';
      return (
        '<article class="week-card">' +
          '<div class="week-head">' +
            '<h3>' +
              (label ? '<span class="week-label">' + UI.escapeHtml(label) + '</span>' : '') +
              UI.escapeHtml(module.title) +
            '</h3>' +
            (dateLabel ? '<span class="week-date">' + UI.escapeHtml(dateLabel) + '</span>' : '') +
            actions +
          '</div>' +
          (body.length ? '<div class="week-body">' + body.join('') + '</div>' : '') +
        '</article>'
      );
    }).join('');
  }

  function renderTasks(tasks) {
    if (!tasks.length) {
      tasksEl.innerHTML = '<p class="muted">No assignments have been added to this course.</p>';
      updateProgress([]);
      return;
    }

    tasksEl.innerHTML =
      '<div class="table-card">' +
        '<div class="table-scroll">' +
          '<table class="data-table">' +
            '<thead><tr>' +
              '<th scope="col">Assignment</th><th scope="col">Due date</th>' +
              '<th scope="col">Status</th>' +
            '</tr></thead>' +
            '<tbody>' +
              tasks.map(function (task) {
                const status = N.taskStatus(task);
                const phrase = task.due ? N.duePhrase(task.due).text : '';
                return '<tr>' +
                  '<td><span class="task-title">' + UI.escapeHtml(task.title) + '</span></td>' +
                  '<td>' + UI.escapeHtml(N.formatDateTime(task.due)) +
                    (phrase ? '<div class="cell-muted">' + UI.escapeHtml(phrase) + '</div>' : '') +
                  '</td>' +
                  '<td><span class="badge ' + status.cls + '">' + UI.escapeHtml(status.label) + '</span></td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    updateProgress(tasks);
  }

  /* ---------------- loading ---------------- */

  function isCourseTeacher(user, course) {
    if (!user || !course || user.role !== 'teacher') return false;
    if (user.id == null || course.teacherId == null) return false;
    return String(user.id) === String(course.teacherId);
  }

  function load() {
    UI.setState(statusEl, 'loading', 'Loading this course…');

    if (courseId === null || courseId === '') {
      UI.setState(statusEl, 'empty', 'No course was selected. Go back to My Courses and open one.');
      return Promise.resolve();
    }

    return Promise.all([
      window.Api.getCourse(courseId),
      window.Api.getModules(courseId).catch(function () { return []; }),
      window.Api.getTasks().catch(function () { return []; })
    ])
      .then(function (results) {
        state.course = N.normalizeCourse(results[0]);
        courseId = state.course.id;
        state.canEdit = isCourseTeacher(state.user, state.course);
        state.modules = N.asList(results[1]).map(N.normalizeModule);
        const allTasks = N.asList(results[2]).map(N.normalizeTask);
        state.tasks = allTasks.filter(function (task) {
          return task.courseId != null && String(task.courseId) === String(state.course.id);
        });
        renderCourse(state.course);
        renderWeeks(state.modules);
        renderTasks(state.tasks);
        UI.setState(statusEl, null);
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        UI.setState(statusEl, 'error', (err && err.message) || 'Could not load this course.', load);
      });
  }

  /* ---------------- teacher actions ---------------- */

  UI.bindDialog(editDialog);
  UI.bindDialog(weekDialog);

  if (editCourseBtn) {
    editCourseBtn.addEventListener('click', function () {
      const course = state.course;
      if (!course) return;
      hideFormError(editError);
      editCode.value = course.code || '';
      editName.value = course.name || '';
      editDesc.value = course.description || '';
      editStart.value = isoDate(course.startDate);
      editEnd.value = isoDate(course.endDate);
      UI.openDialog(editDialog);
      window.setTimeout(function () { editCode.focus(); }, 30);
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hideFormError(editError);
      const code = editCode.value.trim();
      const name = editName.value.trim();
      if (!code || !name) {
        showFormError(editError, 'Course code and course name are both required.');
        return;
      }
      setBusy(editSubmit, true, 'Saving…');
      window.Api.updateCourse(courseId, {
        code: code,
        name: name,
        description: editDesc.value.trim(),
        start_date: editStart.value || null,
        end_date: editEnd.value || null
      })
        .then(function (raw) {
          state.course = N.normalizeCourse(raw);
          state.canEdit = isCourseTeacher(state.user, state.course);
          renderCourse(state.course);
          UI.toast('Course updated');
          UI.closeDialog(editDialog);
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          showFormError(editError, (err && err.message) || 'Could not save the course.');
        })
        .finally(function () {
          setBusy(editSubmit, false);
        });
    });
  }

  function openWeekDialog(module) {
    hideFormError(weekError);
    weekForm.reset();
    weekId.value = module && module.id != null ? String(module.id) : '';
    weekTitle.textContent = module ? 'Edit week' : 'Add a week';
    weekSubmit.textContent = module ? 'Save week' : 'Add week';
    if (module) {
      weekName.value = module.title || '';
      weekNumber.value = module.weekNumber != null ? String(module.weekNumber) : '';
      weekDate.value = isoDate(module.startDate);
      weekContent.value = module.content || '';
      weekLinks.value = linksToText(module.links);
    }
    UI.openDialog(weekDialog);
    window.setTimeout(function () { weekName.focus(); }, 30);
  }

  if (addWeekBtn) {
    addWeekBtn.addEventListener('click', function () { openWeekDialog(null); });
  }

  if (modulesEl) {
    modulesEl.addEventListener('click', function (event) {
      const editBtn = event.target.closest('[data-edit-week]');
      if (editBtn) {
        const id = editBtn.getAttribute('data-edit-week');
        const module = state.modules.find(function (item) { return String(item.id) === String(id); });
        if (module) openWeekDialog(module);
        return;
      }
      const deleteBtn = event.target.closest('[data-delete-week]');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-delete-week');
        const module = state.modules.find(function (item) { return String(item.id) === String(id); });
        const label = module ? module.title : 'this week';
        if (!window.confirm('Delete "' + label + '"? This cannot be undone.')) return;
        window.Api.deleteModule(courseId, id)
          .then(function () {
            UI.toast('Week deleted');
            return load();
          })
          .catch(function (err) {
            if (err && err.status === 401) return;
            UI.toast((err && err.message) || 'Could not delete that week.', 'error');
          });
      }
    });
  }

  if (weekForm) {
    weekForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hideFormError(weekError);
      const title = weekName.value.trim();
      if (!title) {
        showFormError(weekError, 'Please enter a title for this week.');
        weekName.focus();
        return;
      }
      const payload = {
        title: title,
        week_number: weekNumber.value ? Number(weekNumber.value) : null,
        start_date: weekDate.value || null,
        content: weekContent.value.trim(),
        links: parseLinkLines(weekLinks.value)
      };
      const existingId = weekId.value;
      setBusy(weekSubmit, true, 'Saving…');
      const request = existingId
        ? window.Api.updateModule(courseId, existingId, payload)
        : window.Api.addModule(courseId, payload);
      request
        .then(function () {
          UI.toast(existingId ? 'Week updated' : 'Week added');
          UI.closeDialog(weekDialog);
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          showFormError(weekError, (err && err.message) || 'Could not save this week.');
        })
        .finally(function () {
          setBusy(weekSubmit, false);
        });
    });
  }

  /* ---------------- start ---------------- */

  UI.initNavbar().then(function (user) {
    state.user = user;
    return load();
  });
})();
