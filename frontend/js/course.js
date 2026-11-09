/**
 * Course page: course summary, module list and the assignments of one course.
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
  const codeEl = document.getElementById('course-code');
  const moduleCountEl = document.getElementById('course-module-count');
  const taskCountEl = document.getElementById('course-task-count');
  const modulesEl = document.getElementById('modules-list');
  const tasksEl = document.getElementById('tasks-list');
  const statusEl = document.getElementById('course-status');
  const progressValue = document.getElementById('progress-value');
  const progressFill = document.getElementById('progress-fill');
  const allAssignmentsLink = document.getElementById('all-assignments-link');
  const refreshLink = document.getElementById('refresh-link');
  const expandAllBtn = document.getElementById('expand-all');

  const expandAll = UI.initSections();
  UI.initTabs();

  let courseId = null;
  try {
    const params = new URLSearchParams(window.location.search);
    courseId = params.get('id');
  } catch (e) {
    courseId = null;
  }

  if (expandAllBtn) expandAllBtn.addEventListener('click', expandAll);
  if (refreshLink) {
    refreshLink.addEventListener('click', function (event) {
      event.preventDefault();
      load();
    });
  }

  /* ---------------- rendering helpers ---------------- */

  function renderModules(modules) {
    moduleCountEl.textContent = String(modules.length);

    if (!modules.length) {
      modulesEl.innerHTML = '<p class="muted">This course has no modules yet.</p>';
      return;
    }

    modulesEl.innerHTML = modules.map(function (module, index) {
      return (
        '<div class="resource">' +
          '<span class="file-icon" style="background:#0f6cbf">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<a href="#">' + UI.escapeHtml(module.title) + '</a>' +
        '</div>'
      );
    }).join('');
  }

  function renderTasks(tasks) {
    taskCountEl.textContent = String(tasks.length);

    if (!tasks.length) {
      tasksEl.innerHTML = '<p class="muted">No assignments have been added to this course.</p>';
      updateProgress([]);
      return;
    }

    tasksEl.innerHTML =
      '<div class="table-card" style="box-shadow:none">' +
        '<div class="table-scroll">' +
          '<table class="data-table">' +
            '<thead><tr>' +
              '<th scope="col">Assignment</th><th scope="col">Due date</th>' +
              '<th scope="col">Weighting</th><th scope="col">Status</th>' +
            '</tr></thead>' +
            '<tbody>' +
              tasks.map(function (task) {
                const status = N.taskStatus(task);
                return '<tr>' +
                  '<td><span class="task-title">' + UI.escapeHtml(task.title) + '</span></td>' +
                  '<td>' + UI.escapeHtml(N.formatDateTime(task.due)) + '</td>' +
                  '<td>' + UI.escapeHtml(N.weightText(task.weighting)) + '</td>' +
                  '<td><span class="badge ' + status.cls + '">' + UI.escapeHtml(status.label) + '</span></td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    updateProgress(tasks);
  }

  function updateProgress(tasks) {
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

  /* ---------------- loading ---------------- */

  function load() {
    UI.setState(statusEl, 'loading', 'Loading this course…');

    return window.Api.getCourses()
      .then(function (data) {
        const courses = N.asList(data).map(N.normalizeCourse);
        if (!courses.length) {
          throw { handled: true, message: 'You are not enrolled in any course yet.' };
        }

        let course;
        if (courseId !== null && courseId !== '') {
          course = courses.find(function (item) { return String(item.id) === String(courseId); });
        }
        if (!course) course = courses[0];

        courseId = course.id;
        document.title = course.name + ' · VTC-SAS';
        titleEl.textContent = course.name;
        metaEl.innerHTML =
          (course.code ? '<strong>' + UI.escapeHtml(course.code) + '</strong>' : '') +
          '<span class="cell-muted"> · VTC-SAS course</span>';
        crumbEl.textContent = course.code || course.name;
        descEl.textContent = course.description || 'No description has been added to this course yet.';
        codeEl.textContent = course.code || '—';
        if (allAssignmentsLink) {
          allAssignmentsLink.href = 'assignments.html' + (course.id != null ? '?course=' + encodeURIComponent(course.id) : '');
        }

        UI.setState(statusEl, null);

        const modulesPromise = window.Api.getModules(course.id)
          .then(function (raw) {
            renderModules(N.asList(raw).map(N.normalizeModule));
          })
          .catch(function () {
            moduleCountEl.textContent = '0';
            modulesEl.innerHTML = '<p class="muted">Modules are not available for this course.</p>';
          });

        const tasksPromise = window.Api.getTasks()
          .then(function (raw) {
            const all = N.asList(raw).map(N.normalizeTask);
            const mine = all.filter(function (task) {
              return task.courseId != null && String(task.courseId) === String(course.id);
            });
            renderTasks(mine);
          })
          .catch(function () {
            taskCountEl.textContent = '0';
            tasksEl.innerHTML = '<p class="muted">Assignments could not be loaded.</p>';
          });

        return Promise.all([modulesPromise, tasksPromise]);
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        if (err && err.handled) {
          UI.setState(statusEl, 'empty', err.message);
          return;
        }
        UI.setState(statusEl, 'error', (err && err.message) || 'Could not load this course.', load);
      });
  }

  /* ---------------- start ---------------- */

  UI.initNavbar();
  load();
})();
