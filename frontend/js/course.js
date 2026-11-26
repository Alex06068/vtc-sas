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
  const reviewExtractBtn = document.getElementById('review-extract-btn');
  const studentViewBtn = document.getElementById('student-view-btn');
  const extractBanner = document.getElementById('extract-banner');
  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmForm = document.getElementById('confirm-form');
  const confirmError = document.getElementById('confirm-error');
  const confirmList = document.getElementById('confirm-list');
  const confirmSubmit = document.getElementById('confirm-submit');

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

  const state = { course: null, modules: [], tasks: [], files: [], user: null, canEdit: false, studentView: false };

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

  function teacherUI() {
    return state.canEdit && !state.studentView;
  }

  function typeLabel(type) {
    if (type === 'assignment_brief') return 'Assignment brief';
    if (type === 'exam_schedule') return 'Exam schedule';
    if (type === 'assignment') return 'Assignment';
    if (type === 'exam') return 'Exam';
    return 'Notes';
  }

  function filesForModule(moduleId) {
    return (state.files || []).filter(function (file) {
      return String(file.module_id) === String(moduleId);
    });
  }

  function pendingExtractions() {
    const items = [];
    (state.files || []).forEach(function (file) {
      (file.extractions || []).forEach(function (item) {
        if (item.status === 'pending') items.push(Object.assign({ filename: file.original_name, classified_type: file.classified_type }, item));
      });
    });
    return items;
  }

  function localDateTimeValue(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      const raw = String(value);
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
      return '';
    }
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function itemDateText(item) {
    if (!item || !item.due_at) return '';
    const when = N.formatDateTime(item.due_at);
    const place = item.location ? ' · ' + item.location : '';
    const kind = item.kind === 'exam' ? 'Exam' : 'Due';
    return kind + ' ' + when + place;
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
    if (state.canEdit) {
      UI.show(teacherActions);
      if (studentViewBtn) studentViewBtn.textContent = state.studentView ? 'Exit student view' : 'Student view';
      if (reviewExtractBtn) reviewExtractBtn.hidden = !teacherUI() || pendingExtractions().length === 0;
      if (editCourseBtn) editCourseBtn.hidden = state.studentView;
      if (addWeekBtn) addWeekBtn.hidden = state.studentView;
    } else {
      UI.hide(teacherActions);
    }
    if (extractBanner) {
      const pending = pendingExtractions();
      if (teacherUI() && pending.length) {
        extractBanner.hidden = false;
        extractBanner.innerHTML = pending.length === 1
          ? '1 extracted date is waiting for confirmation before students can see it as a due item. <button type="button" class="text-action" id="banner-review-btn">Review</button>'
          : pending.length + ' extracted dates are waiting for confirmation before students can see them as due items. <button type="button" class="text-action" id="banner-review-btn">Review</button>';
      } else {
        extractBanner.hidden = true;
        extractBanner.innerHTML = '';
      }
    }
  }

  function renderWeeks(modules) {
    if (!modules.length) {
      modulesEl.innerHTML = '';
      const message = teacherUI()
        ? 'This course has no weeks yet. Add week 1 to get started.'
        : 'This course has no weeks yet.';
      const actions = teacherUI()
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
      const actions = teacherUI()
        ? '<div class="week-actions">' +
            '<button type="button" class="text-action" data-edit-week="' + UI.escapeHtml(String(module.id)) + '">Edit</button>' +
            '<button type="button" class="text-action danger" data-delete-week="' + UI.escapeHtml(String(module.id)) + '">Delete</button>' +
          '</div>'
        : '';
      const files = filesForModule(module.id);
      if (files.length) {
        body.push('<ul class="week-files">' + files.map(function (file) {
          const dates = (file.extractions || []).filter(function (item) {
            return item.status === 'confirmed' || teacherUI();
          }).map(function (item) {
            const pending = item.status === 'pending';
            const text = itemDateText(item) || (item.title || 'Item');
            const source = teacherUI()
              ? (pending ? ' · unconfirmed, from this file' : ' · confirmed, from this file')
              : '';
            return '<span class="file-date' + (pending ? ' is-pending' : '') + '">' + UI.escapeHtml(text + source) + '</span>';
          }).join('');
          const deleteBtn = teacherUI()
            ? '<button type="button" class="text-action danger" data-delete-file="' + UI.escapeHtml(String(file.id)) + '">Remove</button>'
            : '';
          return (
            '<li class="week-file">' +
              '<button type="button" class="file-open text-action" data-open-file="' + UI.escapeHtml(String(file.id)) + '" data-file-name="' + UI.escapeHtml(file.original_name || 'file') + '">' +
                UI.escapeHtml(file.original_name || 'file') +
              '</button>' +
              '<span class="badge ' + (file.classified_type === 'exam_schedule' ? 'badge-danger' : file.classified_type === 'assignment_brief' ? 'badge-warning' : 'badge-muted') + '">' +
                UI.escapeHtml(typeLabel(file.classified_type)) +
              '</span>' +
              dates +
              deleteBtn +
            '</li>'
          );
        }).join('') + '</ul>');
      }
      if (teacherUI()) {
        body.push(
          '<div class="dropzone" data-week-drop="' + UI.escapeHtml(String(module.id)) + '">' +
            '<p>Drop Word, Excel, PowerPoint or PDF files here, or <label class="text-action">browse<input type="file" multiple accept=".docx,.xlsx,.pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation" data-week-file="' + UI.escapeHtml(String(module.id)) + '" hidden></label>.</p>' +
            '<p class="cell-muted">A whole batch can go into this week. Extracted dates need your confirmation before students see them as due items.</p>' +
          '</div>'
        );
      }
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
      window.Api.getTasks().catch(function () { return []; }),
      window.Api.getCourseFiles(courseId).catch(function () { return []; })
    ])
      .then(function (results) {
        state.course = N.normalizeCourse(results[0]);
        courseId = state.course.id;
        state.canEdit = isCourseTeacher(state.user, state.course);
        state.modules = N.asList(results[1]).map(N.normalizeModule);
        const allTasks = N.asList(results[2]).map(N.normalizeTask);
        state.files = N.asList(results[3]);
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

  /* ---------------- files and confirmation ---------------- */

  function uploadToWeek(moduleId, fileList) {
    const files = fileList ? Array.prototype.slice.call(fileList) : [];
    if (!files.length) return;
    window.Api.uploadWeekFiles(courseId, moduleId, files)
      .then(function (result) {
        const errors = (result && result.errors) || [];
        if (errors.length) UI.toast(errors[0], 'error');
        const pending = (result && result.extractions) || [];
        UI.toast(pending.length ? 'Files uploaded. Please confirm the extracted dates.' : 'Files uploaded.');
        return load().then(function () {
          if (pending.length) openConfirmDialog();
        });
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        UI.toast((err && err.message) || 'Could not upload those files.', 'error');
      });
  }

  function openConfirmDialog(list) {
    const items = list && list.length ? list : pendingExtractions();
    if (!confirmDialog || !confirmList) return;
    hideFormError(confirmError);
    if (!items.length) {
      UI.toast('There are no extracted dates waiting for confirmation.');
      return;
    }
    confirmList.innerHTML = items.map(function (item) {
      const id = UI.escapeHtml(String(item.id));
      return (
        '<div class="confirm-row" data-extract-id="' + id + '">' +
          '<p class="confirm-file">' + UI.escapeHtml(item.filename || 'File') + '</p>' +
          '<div class="field-row">' +
            '<div class="field">' +
              '<label>Type</label>' +
              '<select data-field="classified_type">' +
                '<option value="notes"' + (item.classified_type === 'notes' ? ' selected' : '') + '>Notes</option>' +
                '<option value="assignment_brief"' + (item.classified_type === 'assignment_brief' ? ' selected' : '') + '>Assignment brief</option>' +
                '<option value="exam_schedule"' + (item.classified_type === 'exam_schedule' ? ' selected' : '') + '>Exam schedule</option>' +
              '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label>Kind</label>' +
              '<select data-field="kind">' +
                '<option value="assignment"' + (item.kind !== 'exam' ? ' selected' : '') + '>Assignment</option>' +
                '<option value="exam"' + (item.kind === 'exam' ? ' selected' : '') + '>Exam</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="field">' +
            '<label>Name</label>' +
            '<input type="text" data-field="title" value="' + UI.escapeHtml(item.title || '') + '">' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field">' +
              '<label>Date and time</label>' +
              '<input type="datetime-local" data-field="due_at" value="' + UI.escapeHtml(localDateTimeValue(item.due_at)) + '">' +
            '</div>' +
            '<div class="field">' +
              '<label>Place <span class="cell-muted">(optional)</span></label>' +
              '<input type="text" data-field="location" value="' + UI.escapeHtml(item.location || '') + '">' +
            '</div>' +
          '</div>' +
          '<label class="confirm-dismiss"><input type="checkbox" data-field="dismiss"> Dismiss this item</label>' +
        '</div>'
      );
    }).join('');
    UI.openDialog(confirmDialog);
  }

  function collectConfirmItems() {
    if (!confirmList) return [];
    return Array.prototype.slice.call(confirmList.querySelectorAll('.confirm-row')).map(function (row) {
      const dismiss = row.querySelector('[data-field="dismiss"]');
      const due = row.querySelector('[data-field="due_at"]');
      const dueValue = due && due.value ? new Date(due.value) : null;
      return {
        id: Number(row.getAttribute('data-extract-id')),
        action: dismiss && dismiss.checked ? 'dismiss' : 'confirm',
        title: (row.querySelector('[data-field="title"]') || {}).value,
        kind: (row.querySelector('[data-field="kind"]') || {}).value,
        due_at: dueValue && !Number.isNaN(dueValue.getTime()) ? dueValue.toISOString() : null,
        location: (row.querySelector('[data-field="location"]') || {}).value,
        classified_type: (row.querySelector('[data-field="classified_type"]') || {}).value
      };
    });
  }

  UI.bindDialog(confirmDialog);

  if (studentViewBtn) {
    studentViewBtn.addEventListener('click', function () {
      state.studentView = !state.studentView;
      renderCourse(state.course);
      renderWeeks(state.modules);
    });
  }

  if (reviewExtractBtn) {
    reviewExtractBtn.addEventListener('click', function () { openConfirmDialog(); });
  }

  if (extractBanner) {
    extractBanner.addEventListener('click', function (event) {
      if (event.target && event.target.id === 'banner-review-btn') openConfirmDialog();
    });
  }

  if (modulesEl) {
    modulesEl.addEventListener('dragover', function (event) {
      const zone = event.target.closest('[data-week-drop]');
      if (!zone || !teacherUI()) return;
      event.preventDefault();
      zone.classList.add('is-over');
    });
    modulesEl.addEventListener('dragleave', function (event) {
      const zone = event.target.closest('[data-week-drop]');
      if (zone) zone.classList.remove('is-over');
    });
    modulesEl.addEventListener('drop', function (event) {
      const zone = event.target.closest('[data-week-drop]');
      if (!zone || !teacherUI()) return;
      event.preventDefault();
      zone.classList.remove('is-over');
      uploadToWeek(zone.getAttribute('data-week-drop'), event.dataTransfer && event.dataTransfer.files);
    });
    modulesEl.addEventListener('change', function (event) {
      const input = event.target.closest('[data-week-file]');
      if (!input) return;
      uploadToWeek(input.getAttribute('data-week-file'), input.files);
      input.value = '';
    });
  }

  // File open/delete uses the same click listener already bound on modulesEl for week edit.
  if (modulesEl) {
    modulesEl.addEventListener('click', function (event) {
      const openBtn = event.target.closest('[data-open-file]');
      if (openBtn) {
        window.Api.downloadWeekFile(courseId, openBtn.getAttribute('data-open-file'), openBtn.getAttribute('data-file-name'))
          .catch(function (err) {
            if (err && err.status === 401) return;
            UI.toast((err && err.message) || 'Could not open that file.', 'error');
          });
        return;
      }
      const deleteBtn = event.target.closest('[data-delete-file]');
      if (deleteBtn) {
        if (!window.confirm('Remove this file from the week? Confirmed due dates stay in the assignment list.')) return;
        window.Api.deleteWeekFile(courseId, deleteBtn.getAttribute('data-delete-file'))
          .then(function () {
            UI.toast('File removed');
            return load();
          })
          .catch(function (err) {
            if (err && err.status === 401) return;
            UI.toast((err && err.message) || 'Could not remove that file.', 'error');
          });
      }
    });
  }

  if (confirmForm) {
    confirmForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hideFormError(confirmError);
      const items = collectConfirmItems();
      if (!items.length) return;
      setBusy(confirmSubmit, true, 'Saving…');
      window.Api.confirmExtractions(courseId, items)
        .then(function (result) {
          const confirmed = (result && result.confirmed) || [];
          const dismissed = (result && result.dismissed) || [];
          UI.toast((confirmed.length ? confirmed.length + ' confirmed' : 'Updated') + (dismissed.length ? ', ' + dismissed.length + ' dismissed' : ''));
          UI.closeDialog(confirmDialog);
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          showFormError(confirmError, (err && err.message) || 'Could not save those items.');
        })
        .finally(function () {
          setBusy(confirmSubmit, false);
        });
    });
  }

  /* ---------------- start ---------------- */

  UI.initNavbar().then(function (user) {
    state.user = user;
    return load();
  });
})();
