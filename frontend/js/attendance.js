/**
 * 出席记录：显示签到历史，支持今日签到（POST /api/attendance/checkin）。
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

  /* ---------------- 渲染 ---------------- */

  function load() {
    UI.setState(statusEl, 'loading', '正在加载出席记录…');
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
          '还没有出席记录。点击上方「签到（出勤）」记下今天。'
        );
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        UI.setState(statusEl, 'error', (err && err.message) || '出席记录加载失败，请稍后重试。', load);
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
      todayStatusEl.textContent = '尚未签到';
      return;
    }
    const meta = N.attendanceStatus(record.status);
    todayStatusEl.className = 'badge ' + meta.cls;
    todayStatusEl.textContent = '今日：' + meta.label;
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

  /* ---------------- 签到 ---------------- */

  function setCheckinBusy(busy) {
    if (!checkinBtn) return;
    if (busy) {
      checkinBtn.dataset.label = checkinBtn.textContent;
      checkinBtn.textContent = '签到中…';
      checkinBtn.disabled = true;
    } else {
      checkinBtn.textContent = checkinBtn.dataset.label || '签到（出勤）';
      checkinBtn.disabled = false;
    }
  }

  if (checkinBtn) {
    checkinBtn.addEventListener('click', function () {
      setCheckinBusy(true);
      window.Api.checkin('present')
        .then(function () {
          UI.toast('签到成功，今天记为出勤');
          return load();
        })
        .catch(function (err) {
          if (err && err.status === 401) return;
          UI.toast((err && err.message) || '签到失败，请稍后重试。', 'error');
        })
        .finally(function () {
          setCheckinBusy(false);
        });
    });
  }

  /* ---------------- 启动 ---------------- */

  UI.initNavbar();
  load();
})();
