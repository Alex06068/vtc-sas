/**
 * Course calendar: a Moodle-style month grid.
 *
 * Every day shows only its date number, like an ordinary calendar day. Colours
 * tell you what is happening on a day:
 *   gold   – at least one assignment is due
 *   red    – an exam / quiz / test is scheduled (red number, white cell)
 *   purple – a project / project milestone is due
 *   red bg – Hong Kong public holiday
 *
 * Assignment deadlines come from GET /api/tasks/. Stored events come from
 * GET /api/calendar/events. Holidays come from GET /api/calendar/holidays
 * (with js/holidays.js as a fallback). Teachers can create, edit and delete
 * calendar events; students can only view them.
 */
(function () {
  'use strict';

  if (!window.VtcUI.requireAuth()) return;

  const UI = window.VtcUI;
  const N = window.VtcNormalize;

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const grid = document.getElementById('cal-grid');
  const monthEl = document.getElementById('cal-month');
  const statusEl = document.getElementById('cal-status');
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const todayBtn = document.getElementById('cal-today');
  const detailTitle = document.getElementById('detail-title');
  const detailSub = document.getElementById('detail-sub');
  const detailEvents = document.getElementById('detail-events');
  const holidaySub = document.getElementById('holiday-sub');
  const holidayList = document.getElementById('holiday-list');

  const editor = document.getElementById('event-editor');
  const eventForm = document.getElementById('event-form');
  const eventId = document.getElementById('event-id');
  const eventTitle = document.getElementById('event-title');
  const eventDate = document.getElementById('event-date');
  const eventType = document.getElementById('event-type');
  const eventCourse = document.getElementById('event-course');
  const eventError = document.getElementById('event-error');
  const eventCancel = document.getElementById('event-cancel');
  const eventDelete = document.getElementById('event-delete');
  const eventEditorTitle = document.getElementById('event-editor-title');

  const now = new Date();
  const todayKey = N.todayISO();

  const state = {
    year: now.getFullYear(),
    month: now.getMonth(),
    selected: todayKey,
    tasks: [],
    courses: [],
    events: [],
    holidays: {},
    canEdit: false
  };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function keyOf(year, month, day) {
    return year + '-' + pad(month + 1) + '-' + pad(day);
  }

  function dateKey(value) {
    if (!value) return '';
    const text = N.formatDate(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function holidayOf(key) {
    return state.holidays[key] || '';
  }

  function courseLabel(courseId) {
    if (courseId === undefined || courseId === null || courseId === '') return '';
    const course = state.courses.find(function (item) {
      return String(item.id) === String(courseId);
    });
    if (!course) return '';
    return course.code || course.name || '';
  }

  function classifyTask(task) {
    const category = String(task.category || '').toLowerCase();
    if (category === 'exam' || category === 'project' || category === 'assignment') {
      return category;
    }
    const text = String(task.title || '');
    if (/\b(exam|midterm|final|quiz|test|assessment)\b/i.test(text) || /考试|測驗|評核/.test(text)) {
      return 'exam';
    }
    if (/\bproject\b/i.test(text) || /项目|專題|專案/.test(text)) {
      return 'project';
    }
    return 'assignment';
  }

  function classifyEvent(event) {
    const kind = String(event.type || 'event').toLowerCase();
    if (kind === 'exam' || kind === 'project' || kind === 'assignment' || kind === 'holiday') {
      return kind;
    }
    return 'event';
  }

  function kindOfDay(tasks, events) {
    const kinds = tasks.map(classifyTask).concat(events.map(classifyEvent));
    if (kinds.indexOf('exam') !== -1) return 'exam';
    if (kinds.indexOf('project') !== -1) return 'project';
    if (kinds.indexOf('assignment') !== -1) return 'assignment';
    if (kinds.indexOf('event') !== -1) return 'event';
    return '';
  }

  function kindBadge(kind) {
    if (kind === 'exam') return '<span class="badge badge-danger">Exam</span>';
    if (kind === 'project') return '<span class="badge badge-project">Project</span>';
    if (kind === 'assignment') return '<span class="badge badge-warning">Assignment</span>';
    if (kind === 'holiday') return '<span class="badge badge-danger">Holiday</span>';
    return '<span class="badge">Event</span>';
  }

  function dueTime(task) {
    if (!task.due) return '—';
    const text = N.formatDateTime(task.due);
    return text.split(' ')[1] || '—';
  }

  function fillCourseSelect() {
    if (!eventCourse) return;
    const current = eventCourse.value;
    eventCourse.innerHTML = '<option value="">All courses</option>' + state.courses.map(function (course) {
      return '<option value="' + UI.escapeHtml(String(course.id)) + '">' +
        UI.escapeHtml(course.code ? course.code + ' · ' + course.name : course.name) + '</option>';
    }).join('');
    if (current) eventCourse.value = current;
  }

  function resetEditor(dateValue) {
    if (!eventForm) return;
    eventId.value = '';
    eventTitle.value = '';
    eventDate.value = dateValue || state.selected;
    eventType.value = 'event';
    eventCourse.value = '';
    if (eventError) {
      eventError.textContent = '';
      eventError.classList.remove('show');
    }
    if (eventEditorTitle) eventEditorTitle.textContent = 'Add event';
    if (eventCancel) eventCancel.hidden = true;
    if (eventDelete) eventDelete.hidden = true;
  }

  function editEvent(event) {
    if (!state.canEdit || !eventForm) return;
    eventId.value = String(event.id);
    eventTitle.value = event.title || '';
    eventDate.value = dateKey(event.start_at) || state.selected;
    eventType.value = classifyEvent(event) === 'holiday' ? 'event' : (event.type || 'event');
    eventCourse.value = event.course_id ? String(event.course_id) : '';
    if (eventEditorTitle) eventEditorTitle.textContent = 'Edit event';
    if (eventCancel) eventCancel.hidden = false;
    if (eventDelete) eventDelete.hidden = false;
    if (editor) editor.scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- data ---------------- */

  function load() {
    UI.setState(statusEl, 'loading', 'Loading calendar…');
    return Promise.all([
      window.Api.getTasks(),
      window.Api.getCourses().catch(function () { return []; }),
      window.Api.getCalendarEvents().catch(function () { return []; }),
      window.Api.getHolidays().catch(function () { return []; })
    ])
      .then(function (results) {
        state.tasks = N.asList(results[0]).map(N.normalizeTask);
        state.courses = N.asList(results[1]).map(N.normalizeCourse);
        state.events = N.asList(results[2]);
        const holidays = {};
        N.asList(results[3]).forEach(function (row) {
          if (row && row.date && row.name) holidays[row.date] = row.name;
        });
        if (!Object.keys(holidays).length && window.VTC_HOLIDAYS) {
          Object.keys(window.VTC_HOLIDAYS).forEach(function (key) {
            holidays[key] = window.VTC_HOLIDAYS[key];
          });
        }
        state.holidays = holidays;
        fillCourseSelect();
        UI.setState(statusEl, null);
        render();
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        UI.setState(statusEl, 'error', (err && err.message) || 'Could not load the calendar.', load);
      });
  }

  function groupByDate() {
    const tasksByDate = {};
    state.tasks.forEach(function (task) {
      const key = dateKey(task.due);
      if (!key) return;
      (tasksByDate[key] = tasksByDate[key] || []).push(task);
    });
    const eventsByDate = {};
    state.events.forEach(function (event) {
      const key = dateKey(event.start_at);
      if (!key) return;
      (eventsByDate[key] = eventsByDate[key] || []).push(event);
    });
    return { tasksByDate: tasksByDate, eventsByDate: eventsByDate };
  }

  /* ---------------- calendar grid ---------------- */

  function dayCell(date, groups, selectedKey) {
    const key = keyOf(date.getFullYear(), date.getMonth(), date.getDate());
    const inMonth = date.getMonth() === state.month && date.getFullYear() === state.year;
    const dow = date.getDay();
    const holiday = holidayOf(key);
    const tasks = groups.tasksByDate[key] || [];
    const events = groups.eventsByDate[key] || [];
    const kind = kindOfDay(tasks, events);
    const isToday = key === todayKey;
    const isSelected = key === selectedKey;

    const classes = ['cal-day'];
    if (!inMonth) classes.push('is-outside');
    if (dow === 0 || dow === 6) classes.push('is-weekend');
    if (holiday) classes.push('is-holiday');
    if (kind) classes.push('is-' + kind);
    if (isToday) classes.push('is-today');
    if (isSelected) classes.push('is-selected');

    const bits = [];
    if (holiday) bits.push('Public holiday: ' + holiday);
    events.forEach(function (event) {
      const code = courseLabel(event.course_id);
      bits.push((code ? code + ' · ' : '') + event.title);
    });
    tasks.forEach(function (task) {
      const code = courseLabel(task.courseId);
      bits.push((code ? code + ' · ' : '') + task.title);
    });
    const tip = bits.join('\n');

    return (
      '<button type="button" class="' + classes.join(' ') + '" data-date="' + key + '"' +
        (tip ? ' title="' + UI.escapeHtml(tip) + '"' : '') + '>' +
        '<span class="cal-daynum">' + date.getDate() + '</span>' +
      '</button>'
    );
  }

  function renderGrid(groups) {
    const first = new Date(state.year, state.month, 1);
    const start = new Date(state.year, state.month, 1 - first.getDay());
    let html = '';

    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      html += dayCell(date, groups, state.selected);
    }

    grid.innerHTML = html;
    monthEl.textContent = MONTHS[state.month] + ' ' + state.year;
  }

  function renderDetail(groups) {
    const key = state.selected;
    const date = new Date(key + 'T00:00:00');
    if (Number.isNaN(date.getTime())) {
      detailTitle.textContent = 'Selected day';
      detailSub.textContent = '';
      detailEvents.innerHTML = '';
      return;
    }

    detailTitle.textContent = date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const holiday = holidayOf(key);
    const tasks = groups.tasksByDate[key] || [];
    const events = groups.eventsByDate[key] || [];
    let html = '';

    if (holiday) {
      html += '<p class="cal-detail-holiday"><span class="dot danger" aria-hidden="true"></span> ' +
        UI.escapeHtml(holiday) + '</p>';
    }

    html += events.map(function (event) {
      const kind = classifyEvent(event);
      const code = courseLabel(event.course_id);
      const actions = state.canEdit
        ? '<div class="cal-event-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-edit-event="' + event.id + '">Edit</button>' +
          '</div>'
        : '';
      const meta = [code, kind !== 'event' ? kind : '']
        .filter(function (part) { return part; })
        .join(' · ');
      return '<div class="cal-detail-item">' +
        '<div class="cal-detail-top">' +
          '<strong>' + UI.escapeHtml(event.title) + '</strong>' +
          kindBadge(kind) +
        '</div>' +
        (meta ? '<span class="cell-muted">' + UI.escapeHtml(meta) + '</span>' : '') +
        actions +
        '</div>';
    }).join('');

    html += tasks.map(function (task) {
      const kind = classifyTask(task);
      const code = courseLabel(task.courseId);
      const meta = [code, 'Due ' + dueTime(task), N.weightText(task.weighting)]
        .filter(function (part) { return part && part !== '—'; })
        .join(' · ');
      return '<div class="cal-detail-item">' +
        '<div class="cal-detail-top">' +
          '<strong>' + UI.escapeHtml(task.title) + '</strong>' +
          kindBadge(kind) +
        '</div>' +
        (meta ? '<span class="cell-muted">' + UI.escapeHtml(meta) + '</span>' : '') +
        '</div>';
    }).join('');

    if (!holiday && !tasks.length && !events.length) {
      html = '<p class="muted">Nothing scheduled on this day.</p>';
    }

    detailEvents.innerHTML = html;

    const bits = [];
    if (holiday) bits.push('Public holiday');
    if (events.length) bits.push(events.length + ' event' + (events.length > 1 ? 's' : ''));
    if (tasks.length) bits.push(tasks.length + ' deadline' + (tasks.length > 1 ? 's' : '') + ' due');
    detailSub.textContent = bits.join(' · ');

    if (state.canEdit && eventDate && !eventId.value) {
      eventDate.value = key;
    }
  }

  function renderHolidayList() {
    const prefix = state.year + '-' + pad(state.month + 1) + '-';
    const keys = Object.keys(state.holidays || {})
      .filter(function (key) { return key.indexOf(prefix) === 0; })
      .sort();

    holidayList.innerHTML = keys.length
      ? keys.map(function (key) {
          const day = Number(key.slice(8, 10));
          const date = new Date(key + 'T00:00:00');
          return '<li><span class="cal-date">' + day + ' ' + WEEKDAYS[date.getDay()] + '</span>' +
            '<span>' + UI.escapeHtml(state.holidays[key]) + '</span></li>';
        }).join('')
      : '<li class="muted">No public holidays in ' + MONTHS[state.month] + ' ' + state.year + '.</li>';

    holidaySub.textContent = keys.length
      ? keys.length + ' red-letter day' + (keys.length > 1 ? 's' : '') + ' this month.'
      : 'No public holidays this month.';
  }

  function render() {
    const groups = groupByDate();
    renderGrid(groups);
    renderDetail(groups);
    renderHolidayList();
  }

  /* ---------------- navigation ---------------- */

  function goToMonth(year, month) {
    state.year = year + Math.floor(month / 12);
    state.month = ((month % 12) + 12) % 12;

    const todo = new Date(state.year, state.month, 1);
    state.selected = keyOf(todo.getFullYear(), todo.getMonth(), 1);
    resetEditor(state.selected);
    render();
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      goToMonth(state.year, state.month - 1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      goToMonth(state.year, state.month + 1);
    });
  }
  if (todayBtn) {
    todayBtn.addEventListener('click', function () {
      const today = new Date();
      state.year = today.getFullYear();
      state.month = today.getMonth();
      state.selected = todayKey;
      resetEditor(todayKey);
      render();
    });
  }

  if (grid) {
    grid.addEventListener('click', function (event) {
      const cell = event.target.closest('[data-date]');
      if (!cell) return;
      state.selected = cell.getAttribute('data-date');
      const parts = state.selected.split('-').map(Number);
      state.year = parts[0];
      state.month = parts[1] - 1;
      if (state.canEdit && !eventId.value) resetEditor(state.selected);
      render();
    });
  }

  if (detailEvents) {
    detailEvents.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-edit-event]');
      if (!btn || !state.canEdit) return;
      const id = Number(btn.getAttribute('data-edit-event'));
      const found = state.events.find(function (item) { return Number(item.id) === id; });
      if (found) editEvent(found);
    });
  }

  function showEventError(message) {
    if (!eventError) return;
    eventError.textContent = message || '';
    if (message) eventError.classList.add('show');
    else eventError.classList.remove('show');
  }

  if (eventForm) {
    eventForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!state.canEdit) return;
      const title = eventTitle.value.trim();
      const dateValue = eventDate.value;
      if (!title || !dateValue) {
        showEventError('Title and date are required.');
        return;
      }
      const payload = {
        title: title,
        start_at: dateValue + 'T00:00:00',
        type: eventType.value || 'event',
        course_id: eventCourse.value ? Number(eventCourse.value) : null
      };
      const id = eventId.value;
      const req = id
        ? window.Api.updateCalendarEvent(id, payload)
        : window.Api.createCalendarEvent(payload);
      req.then(function () {
        UI.toast(id ? 'Event updated' : 'Event created');
        resetEditor(dateValue);
        return load();
      }).catch(function (err) {
        if (err && err.status === 401) return;
        if (err && err.status === 403) {
          showEventError('Only teachers can edit the calendar.');
          return;
        }
        showEventError((err && err.message) || 'Could not save the event.');
      });
    });
  }

  if (eventCancel) {
    eventCancel.addEventListener('click', function () {
      resetEditor(state.selected);
    });
  }

  if (eventDelete) {
    eventDelete.addEventListener('click', function () {
      const id = eventId.value;
      if (!id || !state.canEdit) return;
      window.Api.deleteCalendarEvent(id)
        .then(function () {
          UI.toast('Event deleted');
          resetEditor(state.selected);
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          showEventError((err && err.message) || 'Could not delete the event.');
        });
    });
  }

  /* ---------------- start ---------------- */

  UI.initNavbar().then(function (user) {
    state.canEdit = !!(user && user.role === 'teacher');
    if (editor) editor.hidden = !state.canEdit;
    if (state.canEdit) resetEditor(state.selected);
    load();
  });
})();
