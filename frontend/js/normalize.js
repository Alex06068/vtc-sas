/**
 * 数据规范化 + 格式化工具。
 * 后端字段以 backend/app/models.py 与 routers 为准，这里再做一层兜底，
 * 这样后端以后微调字段名时前端不至于直接白屏。
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

  /** 列表接口兜底：直接是数组就返回；否则在常见包装字段里找数组。 */
  function asList(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const keys = ['items', 'data', 'results', 'courses', 'tasks', 'records', 'attendance'];
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
      name: String(pick(raw, ['name', 'title']) || '未命名课程'),
      description: String(pick(raw, ['description', 'summary']) || ''),
      teacherId: pick(raw, ['teacher_id'])
    };
  }

  function normalizeTask(raw) {
    return {
      id: pick(raw, ['id', 'task_id']),
      title: String(pick(raw, ['title', 'name', 'task_name']) || '未命名作业'),
      due: pick(raw, ['due_date', 'deadline', 'due']) || null,
      weighting: pick(raw, ['weighting', 'weight', 'weight_percent']),
      courseId: pick(raw, ['course_id', 'courseId']),
      completed: pick(raw, ['is_completed', 'completed']) === true
    };
  }

  function normalizeAttendance(raw) {
    return {
      date: String(pick(raw, ['date', 'checkin_date', 'created_at']) || ''),
      status: String(pick(raw, ['status', 'state']) || '').toLowerCase()
    };
  }

  /* ---------------- 日期 ---------------- */

  /** 本地时区的今天，格式 YYYY-MM-DD。 */
  function todayISO() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 日期时间 → "YYYY-MM-DD HH:mm"；只给日期则原样返回；解析失败显示原文。 */
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

  /** 日期 → "YYYY-MM-DD"。 */
  function formatDate(value) {
    if (value === undefined || value === null || value === '') return '—';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return formatDateTime(raw).split(' ')[0];
  }

  /* ---------------- 展示文本 ---------------- */

  /** weight 是字符串（"30"、"30%"、"20 points"…）：纯数字补 %；0~1 的小数换成百分比。 */
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

  /** 作业状态徽章：{ cls, label } */
  function taskStatus(task) {
    if (task.completed) return { cls: 'badge-success', label: '已完成' };
    if (!task.due) return { cls: 'badge-muted', label: '未设截止' };

    const due = new Date(task.due);
    if (Number.isNaN(due.getTime())) return { cls: 'badge-muted', label: '—' };

    const diff = due.getTime() - Date.now();
    if (diff < 0) return { cls: 'badge-danger', label: '已截止' };
    if (diff < 7 * 24 * 60 * 60 * 1000) return { cls: 'badge-warning', label: '即将截止' };
    return { cls: 'badge-info', label: '进行中' };
  }

  const ATTENDANCE_STATUS = {
    present: { cls: 'badge-success', label: '出勤' },
    late: { cls: 'badge-warning', label: '迟到' },
    absent: { cls: 'badge-danger', label: '缺勤' },
    excused: { cls: 'badge-muted', label: '请假' },
    leave: { cls: 'badge-muted', label: '请假' }
  };

  /** 出席状态徽章：{ cls, label } */
  function attendanceStatus(status) {
    const key = String(status || '').toLowerCase();
    return ATTENDANCE_STATUS[key] || { cls: 'badge-muted', label: status || '未知' };
  }

  window.VtcNormalize = {
    asList: asList,
    normalizeCourse: normalizeCourse,
    normalizeTask: normalizeTask,
    normalizeAttendance: normalizeAttendance,
    todayISO: todayISO,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    weightText: weightText,
    taskStatus: taskStatus,
    attendanceStatus: attendanceStatus
  };
})();
