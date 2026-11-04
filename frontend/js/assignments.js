/**
 * 作业列表：显示作业名称、课程、截止日期、weighting（权重）与状态。
 * 支持按课程筛选、按名称搜索，按截止日期升序排列。
 */
(function () {
  'use strict';

  if (!window.VtcUI.requireAuth()) return;

  const UI = window.VtcUI;
  const N = window.VtcNormalize;

  const tbody = document.getElementById('tasks-body');
  const statusEl = document.getElementById('tasks-status');
  const searchInput = document.getElementById('task-search');
  const courseFilter = document.getElementById('course-filter');
  const totalEl = document.getElementById('task-total');
  const openEl = document.getElementById('task-open');
  const overdueEl = document.getElementById('task-overdue');

  const state = {
    tasks: [],
    courses: [],
    filter: '',
    query: ''
  };

  // 从课程卡片点进来时带 ?course=<id>，预选课程筛选
  try {
    const params = new URLSearchParams(window.location.search);
    state.filter = params.get('course') || '';
  } catch (e) {
    state.filter = '';
  }

  /* ---------------- 数据 ---------------- */

  function dueTime(task) {
    if (!task.due) return Infinity;
    const due = new Date(task.due);
    return Number.isNaN(due.getTime()) ? Infinity : due.getTime();
  }

  function sortTasks(tasks) {
    return tasks.slice().sort(function (a, b) {
      const ta = dueTime(a);
      const tb = dueTime(b);
      if (ta === tb) return 0;
      return ta < tb ? -1 : 1;
    });
  }

  function load() {
    UI.setState(statusEl, 'loading', '正在加载作业…');
    return Promise.all([
      window.Api.getTasks(),
      window.Api.getCourses().catch(function () { return null; })
    ])
      .then(function (results) {
        const rawTasks = results[0];
        const rawCourses = results[1];
        state.tasks = sortTasks(N.asList(rawTasks).map(N.normalizeTask));
        state.courses = rawCourses === null ? [] : N.asList(rawCourses).map(N.normalizeCourse);
        populateCourseFilter();
        updateSummary();
        render();
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        UI.setState(statusEl, 'error', (err && err.message) || '作业加载失败，请稍后重试。', load);
      });
  }

  /* ---------------- 筛选与渲染 ---------------- */

  function populateCourseFilter() {
    const options = ['<option value="">全部课程</option>'].concat(
      state.courses.map(function (course) {
        const id = course.id !== undefined && course.id !== null ? String(course.id) : '';
        const label = (course.code ? course.code + ' · ' : '') + course.name;
        return '<option value="' + UI.escapeHtml(id) + '">' + UI.escapeHtml(label) + '</option>';
      })
    );
    courseFilter.innerHTML = options.join('');

    const valid = state.courses.some(function (course) {
      return String(course.id) === state.filter;
    });
    if (!valid) state.filter = '';
    courseFilter.value = state.filter;
  }

  function courseLabel(courseId) {
    if (courseId === undefined || courseId === null || courseId === '') return '—';
    const course = state.courses.find(function (item) {
      return String(item.id) === String(courseId);
    });
    if (!course) return '课程 #' + courseId;
    return course.code ? course.code : course.name;
  }

  function filteredTasks() {
    const query = state.query.trim().toLowerCase();
    return state.tasks.filter(function (task) {
      if (state.filter && String(task.courseId) !== state.filter) return false;
      if (query && task.title.toLowerCase().indexOf(query) === -1) return false;
      return true;
    });
  }

  function updateSummary() {
    const total = state.tasks.length;
    let open = 0;
    let overdue = 0;

    state.tasks.forEach(function (task) {
      if (task.completed) return;
      open += 1;
      if (task.due) {
        const due = new Date(task.due);
        if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) overdue += 1;
      }
    });

    totalEl.textContent = String(total);
    openEl.textContent = String(open);
    overdueEl.textContent = String(overdue);
  }

  function render() {
    const list = filteredTasks();

    if (!state.tasks.length) {
      tbody.innerHTML = '';
      UI.setState(statusEl, 'empty', '暂时没有作业。作业会出现在你已加入的课程里。');
      return;
    }

    UI.setState(statusEl, null);

    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="cell-muted" style="text-align:center;padding:28px;">' +
        '没有符合筛选条件的作业。</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function (task) {
      const status = N.taskStatus(task);
      return (
        '<tr>' +
          '<td><span class="task-title">' + UI.escapeHtml(task.title) + '</span></td>' +
          '<td class="cell-muted">' + UI.escapeHtml(courseLabel(task.courseId)) + '</td>' +
          '<td>' + UI.escapeHtml(N.formatDateTime(task.due)) + '</td>' +
          '<td>' + UI.escapeHtml(N.weightText(task.weighting)) + '</td>' +
          '<td><span class="badge ' + status.cls + '">' + UI.escapeHtml(status.label) + '</span></td>' +
        '</tr>'
      );
    }).join('');
  }

  /* ---------------- 事件 ---------------- */

  searchInput.addEventListener('input', function () {
    state.query = searchInput.value;
    render();
  });

  courseFilter.addEventListener('change', function () {
    state.filter = courseFilter.value;
    render();
  });

  /* ---------------- 启动 ---------------- */

  UI.initNavbar();
  load();
})();
