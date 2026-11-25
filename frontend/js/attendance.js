/**
 * Attendance page: history plus today's check-in (POST /api/attendance/checkin).
 */
(function () {
  'use strict';

  if (!window.VtcUI.requireAuth()) return;

  const UI = window.VtcUI;
  const N = window.VtcNormalize;

  const todayEl = document.getElementById('today-date');
  const todayStatusEl = document.getElementById('today-status');
  const checkinBtn = document.getElementById('checkin-btn');
  const checkinCourse = document.getElementById('checkin-course');
  const checkinFeedbackEl = document.getElementById('checkin-feedback');
  const tbody = document.getElementById('attendance-body');
  const statusEl = document.getElementById('attendance-status');

  const statPresent = document.getElementById('stat-present');
  const statLate = document.getElementById('stat-late');
  const statAbsent = document.getElementById('stat-absent');
  const statTotal = document.getElementById('stat-total');

  const today = N.todayISO();
  const state = { records: [], courses: [] };

  todayEl.textContent = today;

  /* ---------------- rendering ---------------- */

  function courseLabel(courseId) {
    if (courseId === undefined || courseId === null || courseId === '') return '';
    const course = state.courses.find(function (item) {
      return String(item.id) === String(courseId);
    });
    if (!course) return '';
    return course.code || course.name || '';
  }

  function fillCourseSelect() {
    if (!checkinCourse) return;
    const current = checkinCourse.value;
    const options = ['<option value="">No specific course</option>'].concat(
      state.courses.map(function (course) {
        return '<option value="' + UI.escapeHtml(String(course.id)) + '">' +
          UI.escapeHtml(course.code || course.name) + '</option>';
      })
    );
    checkinCourse.innerHTML = options.join('');
    if (current) checkinCourse.value = current;
  }

  function load() {
    UI.setState(statusEl, 'loading', 'Loading attendance records…');
    return Promise.all([
      window.Api.getAttendance(),
      window.Api.getCourses().catch(function () { return []; })
    ])
      .then(function (results) {
        state.records = N.asList(results[0])
          .map(N.normalizeAttendance)
          .sort(function (a, b) { return b.date.localeCompare(a.date); });
        state.courses = N.asList(results[1]).map(N.normalizeCourse);
        fillCourseSelect();
        updateStats();
        renderToday();
        render();
        UI.setState(
          statusEl,
          state.records.length ? null : 'empty',
          'No attendance records yet. Use "Check in" above to record today.'
        );
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        UI.setState(statusEl, 'error', (err && err.message) || 'Could not load your attendance records.', load);
      });
  }

  function updateStats() {
    const counts = { present: 0, late: 0, absent: 0 };
    state.records.forEach(function (record) {
      if (counts[record.status] !== undefined) counts[record.status] += 1;
    });
    statPresent.textContent = String(counts.present);
    statLate.textContent = String(counts.late);
    statAbsent.textContent = String(counts.absent);
    statTotal.textContent = String(state.records.length);
  }

  function renderToday() {
    const record = state.records.find(function (item) { return item.date === today; });
    if (!record) {
      todayStatusEl.className = 'badge badge-muted';
      todayStatusEl.textContent = 'Not checked in';
      return;
    }
    const meta = N.attendanceStatus(record.status);
    todayStatusEl.className = 'badge ' + meta.cls;
    todayStatusEl.textContent = 'Today: ' + meta.label;
  }

  function render() {
    if (!state.records.length) {
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = state.records.map(function (record) {
      const meta = N.attendanceStatus(record.status);
      const course = courseLabel(record.courseId) || '—';
      return (
        '<tr>' +
          '<td>' + UI.escapeHtml(N.formatDate(record.date)) + '</td>' +
          '<td>' + UI.escapeHtml(course) + '</td>' +
          '<td><span class="badge ' + meta.cls + '">' + UI.escapeHtml(meta.label) + '</span></td>' +
        '</tr>'
      );
    }).join('');
  }

  /* ---------------- check in ---------------- */

  function clearCheckinFeedback() {
    if (!checkinFeedbackEl) return;
    checkinFeedbackEl.hidden = true;
    checkinFeedbackEl.textContent = '';
    checkinFeedbackEl.classList.remove('is-error');
  }

  function showCheckinFeedback(message, isError) {
    if (!checkinFeedbackEl) return;
    const text = message || '';
    checkinFeedbackEl.textContent = text;
    checkinFeedbackEl.hidden = !text;
    if (isError) checkinFeedbackEl.classList.add('is-error');
    else checkinFeedbackEl.classList.remove('is-error');
  }

  function setCheckinBusy(busy) {
    if (!checkinBtn) return;
    if (busy) {
      checkinBtn.dataset.label = checkinBtn.textContent;
      checkinBtn.textContent = 'Checking in…';
      checkinBtn.disabled = true;
    } else {
      checkinBtn.textContent = checkinBtn.dataset.label || 'Check in (present)';
      checkinBtn.disabled = false;
    }
  }

  if (checkinBtn) {
    checkinBtn.addEventListener('click', function () {
      setCheckinBusy(true);
      clearCheckinFeedback();
      window.Api.checkin('present', checkinCourse && checkinCourse.value)
        .then(function () {
          UI.toast('Checked in — today is recorded as present.');
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          const message = (err && err.message) || 'Check-in failed. Please try again.';
          // Keep the server 403 text on the page; do not imply the device is on a school network.
          showCheckinFeedback(message, true);
          UI.toast(message, 'error');
        })
        .finally(function () {
          setCheckinBusy(false);
        });
    });
  }

  /* ---------------- start ---------------- */

  UI.initNavbar();
  load();
})();
