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
  const tbody = document.getElementById('attendance-body');
  const statusEl = document.getElementById('attendance-status');

  const statPresent = document.getElementById('stat-present');
  const statLate = document.getElementById('stat-late');
  const statAbsent = document.getElementById('stat-absent');
  const statTotal = document.getElementById('stat-total');

  const today = N.todayISO();
  const state = { records: [] };

  todayEl.textContent = today;

  /* ---------------- rendering ---------------- */

  function load() {
    UI.setState(statusEl, 'loading', 'Loading attendance records…');
    return window.Api.getAttendance()
      .then(function (data) {
        state.records = N.asList(data)
          .map(N.normalizeAttendance)
          .sort(function (a, b) { return b.date.localeCompare(a.date); });
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
      return (
        '<tr>' +
          '<td>' + UI.escapeHtml(N.formatDate(record.date)) + '</td>' +
          '<td><span class="badge ' + meta.cls + '">' + UI.escapeHtml(meta.label) + '</span></td>' +
        '</tr>'
      );
    }).join('');
  }

  /* ---------------- check in ---------------- */

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
      window.Api.checkin('present')
        .then(function () {
          UI.toast('Checked in — today is recorded as present.');
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          UI.toast((err && err.message) || 'Check-in failed. Please try again.', 'error');
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
