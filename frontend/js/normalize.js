/**
 * Data normalisation and formatting helpers.
 * Field names mirror backend/app/models.py; the fallbacks here keep the UI
 * alive if the backend renames a field later on.
 */
(function () {
  'use strict';

  function pick(obj, keys) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        return obj[key];
      }
    }
    return undefined;
  }

  /** Accepts a bare array or an object wrapping one of the usual keys. */
  function asList(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const keys = ['items', 'data', 'results', 'courses', 'tasks', 'records', 'attendance', 'modules', 'weeks', 'events', 'messages', 'holidays'];
      for (let i = 0; i < keys.length; i++) {
        if (Array.isArray(data[keys[i]])) return data[keys[i]];
      }
    }
    return [];
  }

  function normalizeCourse(raw) {
    return {
      id: pick(raw, ['id', 'course_id']),
      code: String(pick(raw, ['code']) || ''),
      name: String(pick(raw, ['name', 'title']) || 'Untitled course'),
      description: String(pick(raw, ['description', 'summary']) || ''),
      teacherId: pick(raw, ['teacher_id']),
      startDate: pick(raw, ['start_date', 'startDate']) || null,
      endDate: pick(raw, ['end_date', 'endDate']) || null
    };
  }

  function normalizeTask(raw) {
    return {
      id: pick(raw, ['id', 'task_id']),
      title: String(pick(raw, ['title', 'name', 'task_name']) || 'Untitled assignment'),
      due: pick(raw, ['due_date', 'deadline', 'due']) || null,
      weighting: pick(raw, ['weighting', 'weight', 'weight_percent']),
      courseId: pick(raw, ['course_id', 'courseId']),
      category: pick(raw, ['category', 'type', 'kind']) || '',
      completed: pick(raw, ['is_completed', 'completed']) === true,
      location: String(pick(raw, ['location', 'venue', 'place']) || ''),
      source: String(pick(raw, ['source']) || '')
    };
  }

  function normalizeModule(raw) {
    const linksRaw = pick(raw, ['links']) || [];
    const links = Array.isArray(linksRaw)
      ? linksRaw.map(function (item) {
          if (!item) return null;
          if (typeof item === 'string') return { title: item, url: item };
          const url = String(item.url || '').trim();
          if (!url) return null;
          return { title: String(item.title || url), url: url };
        }).filter(Boolean)
      : [];
    return {
      id: pick(raw, ['id', 'module_id']),
      title: String(pick(raw, ['title', 'name']) || 'Untitled week'),
      order: Number(pick(raw, ['order', 'position']) || 0),
      weekNumber: pick(raw, ['week_number', 'weekNumber']) ?? null,
      startDate: pick(raw, ['start_date', 'startDate']) || null,
      content: String(pick(raw, ['content', 'body', 'materials']) || ''),
      links: links
    };
  }

  function normalizeAttendance(raw) {
    return {
      date: String(pick(raw, ['date', 'checkin_date', 'created_at']) || ''),
      status: String(pick(raw, ['status', 'state']) || '').toLowerCase(),
      courseId: pick(raw, ['course_id', 'courseId'])
    };
  }

  /* ---------------- dates ---------------- */

  /** Local date as YYYY-MM-DD. */
  function todayISO() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Date-time -> "YYYY-MM-DD HH:mm"; date-only is returned as is. */
  function formatDateTime(value) {
    if (value === undefined || value === null || value === '') return '—';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return raw.replace('T', ' ').replace(/\.\d+/, '').replace(/Z$/, '');
    }
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /** Date -> "YYYY-MM-DD". */
  function formatDate(value) {
    if (value === undefined || value === null || value === '') return '—';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return formatDateTime(raw).split(' ')[0];
  }

  /* ---------------- display text ---------------- */

  /** Weighting may be "30", "30%", "20 points" or 0..1: normalise to a label. */
  function weightText(weighting) {
    if (weighting === undefined || weighting === null) return '—';
    const raw = String(weighting).trim();
    if (!raw) return '—';
    if (/^\d+(\.\d+)?$/.test(raw)) {
      const num = parseFloat(raw);
      if (num > 0 && num <= 1) return String(Math.round(num * 100)) + '%';
      return raw + '%';
    }
    return raw;
  }

  /**
   * Relative due phrase, e.g. "Due in 2 days", "Due tomorrow", "1 day overdue".
   * @returns {{ text: string, kind: 'ok'|'soon'|'overdue'|'none' }}
   */
  function duePhrase(value) {
    if (value === undefined || value === null || value === '') {
      return { text: 'No due date', kind: 'none' };
    }
    const due = new Date(value);
    if (Number.isNaN(due.getTime())) return { text: 'No due date', kind: 'none' };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfDue = new Date(due);
    startOfDue.setHours(0, 0, 0, 0);
    const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);

    if (days < 0) {
      const overdue = Math.abs(days);
      return {
        text: overdue === 1 ? '1 day overdue' : overdue + ' days overdue',
        kind: 'overdue'
      };
    }
    if (days === 0) return { text: 'Due today', kind: 'soon' };
    if (days === 1) return { text: 'Due tomorrow', kind: 'soon' };
    if (days <= 7) return { text: 'Due in ' + days + ' days', kind: 'soon' };
    return { text: 'Due in ' + days + ' days', kind: 'ok' };
  }

  /** Assignment status badge: { cls, label } */
  function taskStatus(task) {
    if (task.completed) return { cls: 'badge-success', label: 'Completed' };
    if (!task.due) return { cls: 'badge-muted', label: 'No due date' };

    const due = new Date(task.due);
    if (Number.isNaN(due.getTime())) return { cls: 'badge-muted', label: '—' };

    const diff = due.getTime() - Date.now();
    if (diff < 0) return { cls: 'badge-danger', label: 'Overdue' };
    if (diff < 7 * 24 * 60 * 60 * 1000) return { cls: 'badge-warning', label: 'Due soon' };
    return { cls: 'badge-info', label: 'In progress' };
  }

  const ATTENDANCE_STATUS = {
    present: { cls: 'badge-success', label: 'Present' },
    late: { cls: 'badge-warning', label: 'Late' },
    absent: { cls: 'badge-danger', label: 'Absent' },
    excused: { cls: 'badge-muted', label: 'Excused' },
    leave: { cls: 'badge-muted', label: 'On leave' }
  };

  /** Attendance status badge: { cls, label } */
  function attendanceStatus(status) {
    const key = String(status || '').toLowerCase();
    return ATTENDANCE_STATUS[key] || { cls: 'badge-muted', label: status || 'Unknown' };
  }

  window.VtcNormalize = {
    asList: asList,
    normalizeCourse: normalizeCourse,
    normalizeTask: normalizeTask,
    normalizeModule: normalizeModule,
    normalizeAttendance: normalizeAttendance,
    todayISO: todayISO,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    weightText: weightText,
    duePhrase: duePhrase,
    taskStatus: taskStatus,
    attendanceStatus: attendanceStatus
  };
})();
