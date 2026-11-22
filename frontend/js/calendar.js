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
 * Deadlines come from GET /api/tasks/; holiday data comes from js/holidays.js.
 * Task kinds are inferred from the title because the backend task model has no
 * category field yet (see classifyTask below).
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

  const now = new Date();
  const todayKey = N.todayISO();

  const state = {
    year: now.getFullYear(),
    month: now.getMonth(), // 0-based
    selected: todayKey,
    tasks: [],
    courses: []
  };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function keyOf(year, month, day) {
    return year + '-' + pad(month + 1) + '-' + pad(day);
  }

  function holidayOf(key) {
    return (window.VTC_HOLIDAYS && window.VTC_HOLIDAYS[key]) || '';
  }

  function courseLabel(courseId) {
    if (courseId === undefined || courseId === null || courseId === '') return '';
    const course = state.courses.find(function (item) {
      return String(item.id) === String(courseId);
    });
    if (!course) return '';
    return course.code || course.name || '';
  }

  /**
   * Infer the kind of a deadline from its title. The backend task model is
   * generic (title / due_date / weighting), so exam and project days are
   * recognised by keywords. Swap this for a real `category` field once the
   * API grows one.
   */
  function classifyTask(task) {
    const text = String(task.title || '');
    if (/\b(exam|midterm|final|quiz|test|assessment)\b/i.test(text) || /考试|測驗|評核/.test(text)) {
      return 'exam';
    }
    if (/\bproject\b/i.test(text) || /项目|專題|專案/.test(text)) {
      return 'project';
    }
    return 'assignment';
  }

  /** Highest priority kind for a day: exam > project > assignment. */
  function kindOfDay(tasks) {
    if (!tasks.length) return '';
    const kinds = tasks.map(classifyTask);
    if (kinds.indexOf('exam') !== -1) return 'exam';
    if (kinds.indexOf('project') !== -1) return 'project';
    return 'assignment';
  }

  function kindBadge(kind) {
    if (kind === 'exam') return '<span class="badge badge-danger">Exam</span>';
    if (kind === 'project') return '<span class="badge badge-project">Project</span>';
    return '<span class="badge badge-warning">Assignment</span>';
  }

  function dueTime(task) {
    if (!task.due) return '—';
    const text = N.formatDateTime(task.due);
    return text.split(' ')[1] || '—';
  }

  /* ---------------- data ---------------- */

  function load() {
    UI.setState(statusEl, 'loading', 'Loading assignments…');
    return Promise.all([
      window.Api.getTasks(),
      window.Api.getCourses().catch(function () { return null; })
    ])
      .then(function (results) {
        state.tasks = N.asList(results[0]).map(N.normalizeTask);
        state.courses = results[1] === null ? [] : N.asList(results[1]).map(N.normalizeCourse);
        UI.setState(statusEl, null);
        render();
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        UI.setState(statusEl, 'error', (err && err.message) || 'Could not load your assignments.', load);
      });
  }

  function groupByDate() {
    const map = {};
    state.tasks.forEach(function (task) {
      if (!task.due) return;
      const key = N.formatDate(task.due);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      (map[key] = map[key] || []).push(task);
    });
    return map;
  }

  /* ---------------- calendar grid ---------------- */

  function dayCell(date, byDate, selectedKey) {
    const key = keyOf(date.getFullYear(), date.getMonth(), date.getDate());
    const inMonth = date.getMonth() === state.month && date.getFullYear() === state.year;
    const dow = date.getDay();
    const holiday = holidayOf(key);
    const tasks = byDate[key] || [];
    const kind = kindOfDay(tasks);
    const isToday = key === todayKey;
    const isSelected = key === selectedKey;

    const classes = ['cal-day'];
    if (!inMonth) classes.push('is-outside');
    if (dow === 0 || dow === 6) classes.push('is-weekend');
    if (holiday) classes.push('is-holiday');
    if (kind) classes.push('is-' + kind);
    if (isToday) classes.push('is-today');
    if (isSelected) classes.push('is-selected');

    // Tooltip: the full list of what happens on this day.
    const bits = [];
    if (holiday) bits.push('Public holiday: ' + holiday);
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

  function renderGrid(byDate) {
    const first = new Date(state.year, state.month, 1);
    const start = new Date(state.year, state.month, 1 - first.getDay());
    let html = '';

    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      html += dayCell(date, byDate, state.selected);
    }

    grid.innerHTML = html;
    monthEl.textContent = MONTHS[state.month] + ' ' + state.year;
  }

  /* ---------------- side panels ---------------- */

  function renderDetail(byDate) {
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
    const tasks = byDate[key] || [];
    let html = '';

    if (holiday) {
      html += '<p class="cal-detail-holiday"><span class="dot danger" aria-hidden="true"></span> ' +
        UI.escapeHtml(holiday) + '</p>';
    }

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

    if (!holiday && !tasks.length) {
      html = '<p class="muted">Nothing scheduled on this day.</p>';
    }

    detailEvents.innerHTML = html;

    if (holiday && tasks.length) {
      detailSub.textContent = 'Public holiday · ' + tasks.length + ' deadline' +
        (tasks.length > 1 ? 's' : '') + ' due';
    } else if (holiday) {
      detailSub.textContent = 'Public holiday';
    } else if (tasks.length) {
      detailSub.textContent = tasks.length + ' deadline' + (tasks.length > 1 ? 's' : '') + ' due';
    } else {
      detailSub.textContent = '';
    }
  }

  function renderHolidayList() {
    const prefix = state.year + '-' + pad(state.month + 1) + '-';
    const keys = Object.keys(window.VTC_HOLIDAYS || {})
      .filter(function (key) { return key.indexOf(prefix) === 0; })
      .sort();

    holidayList.innerHTML = keys.length
      ? keys.map(function (key) {
          const day = Number(key.slice(8, 10));
          const date = new Date(key + 'T00:00:00');
          return '<li><span class="cal-date">' + day + ' ' + WEEKDAYS[date.getDay()] + '</span>' +
            '<span>' + UI.escapeHtml(window.VTC_HOLIDAYS[key]) + '</span></li>';
        }).join('')
      : '<li class="muted">No public holidays in ' + MONTHS[state.month] + ' ' + state.year + '.</li>';

    holidaySub.textContent = keys.length
      ? keys.length + ' red-letter day' + (keys.length > 1 ? 's' : '') + ' this month.'
      : 'No public holidays this month.';
  }

  function render() {
    const byDate = groupByDate();
    renderGrid(byDate);
    renderDetail(byDate);
    renderHolidayList();
  }

  /* ---------------- navigation ---------------- */

  function goToMonth(year, month) {
    // normalise overflow / underflow of the month index
    state.year = year + Math.floor(month / 12);
    state.month = ((month % 12) + 12) % 12;

    const todo = new Date(state.year, state.month, 1);
    state.selected = keyOf(todo.getFullYear(), todo.getMonth(), 1);
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
      render();
    });
  }

  /* ---------------- start ---------------- */

  UI.initNavbar();
  load();
})();
