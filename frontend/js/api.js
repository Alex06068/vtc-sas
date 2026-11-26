/**
 * VTC-SAS API client.
 * Every endpoint except login and register requires "Authorization: Bearer <token>".
 * Login is form-encoded (username + password) because the backend uses
 * OAuth2PasswordRequestForm.
 */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const API_BASE = String(cfg.API_BASE || '').replace(/\/+$/, '');

  const TOKEN_KEY = 'vtcsas_token';
  const USER_KEY = 'vtcsas_user';

  class ApiError extends Error {
    constructor(message, status, data) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  }

  /* ---------------- session ---------------- */

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* private mode: ignore */ }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) { /* ignore */ }
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user || {})); } catch (e) { /* ignore */ }
  }

  function redirectToLogin() {
    if (!/login\.html$/.test(window.location.pathname)) {
      window.location.replace('login.html');
    }
  }

  /* ---------------- responses ---------------- */

  function errorMessage(data) {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (data.detail !== undefined) {
      if (Array.isArray(data.detail)) {
        return data.detail
          .map(function (item) { return (item && item.msg) || String(item); })
          .join('; ');
      }
      return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    }
    if (data.message) return String(data.message);
    return '';
  }

  /**
   * Single request helper.
   * @param {string} path  backend path starting with /
   * @param {{method?:string, body?:*, form?:boolean, auth?:boolean}} options
   */
  async function request(path, options) {
    const opts = options || {};
    const method = opts.method || 'GET';
    const headers = {};
    let payload;

    if (opts.body !== undefined && opts.body !== null) {
      if (typeof FormData !== 'undefined' && opts.body instanceof FormData) {
        payload = opts.body;
      } else if (opts.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        payload = new URLSearchParams(opts.body).toString();
      } else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(opts.body);
      }
    }

    const auth = opts.auth !== false;
    if (auth) {
      const token = getToken();
      if (!token) {
        redirectToLogin();
        throw new ApiError('Your session has expired. Please sign in again.', 401, null);
      }
      headers.Authorization = 'Bearer ' + token;
    }

    let res;
    try {
      res = await fetch(API_BASE + path, { method: method, headers: headers, body: payload });
    } catch (err) {
      throw new ApiError(
        'Could not reach the backend. Check API_BASE in js/config.js and make sure the API is running.',
        0,
        null
      );
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = text; }
    }

    if (res.status === 401 && auth) {
      clearSession();
      redirectToLogin();
      throw new ApiError('Your session has expired. Please sign in again.', 401, data);
    }

    if (!res.ok) {
      throw new ApiError(errorMessage(data) || ('Request failed (HTTP ' + res.status + ')'), res.status, data);
    }

    return data;
  }

  /* ---------------- endpoints ---------------- */

  /** Sign in (form encoded). Stores the access token on success. */
  async function login(username, password) {
    const data = await request('/api/auth/login', {
      method: 'POST',
      form: true,
      auth: false,
      body: { username: username, password: password }
    });
    const token = data && (data.access_token || data.token);
    if (!token) {
      throw new ApiError('The login response did not include an access_token.', 0, data);
    }
    setToken(token);
    setUser({ username: username });
    return data;
  }

  /** Register (JSON). Also stores the returned token. */
  async function register(payload) {
    const data = await request('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: payload
    });
    const token = data && (data.access_token || data.token);
    if (!token) {
      throw new ApiError('Registration succeeded but no access_token was returned.', 0, data);
    }
    setToken(token);
    setUser({ username: payload.username, role: payload.role });
    return data;
  }

  /** Current user: { id, username, email, role } */
  function me() {
    return request('/api/auth/me');
  }

  /** Enrolled courses: [{ id, code, name, description, teacher_id }] */
  function getCourses() {
    return request('/api/courses/my');
  }

  /** Join a course by code: POST /api/courses/join/{course_code} */
  function joinCourse(courseCode) {
    return request('/api/courses/join/' + encodeURIComponent(courseCode), { method: 'POST' });
  }

  /** Create a course (teacher only): { code, name, description?, start_date?, end_date? } */
  function createCourse(payload) {
    return request('/api/courses/', { method: 'POST', body: payload });
  }

  /** One course the user can access: { id, code, name, description, teacher_id, start_date, end_date } */
  function getCourse(courseId) {
    return request('/api/courses/' + encodeURIComponent(courseId));
  }

  /** Update a course (course teacher only). */
  function updateCourse(courseId, payload) {
    return request('/api/courses/' + encodeURIComponent(courseId), { method: 'PUT', body: payload });
  }

  /** Weeks/topics of one course: [{ id, course_id, title, week_number, start_date, content, links, order }] */
  function getModules(courseId) {
    return request('/api/courses/' + encodeURIComponent(courseId) + '/modules');
  }

  /** Add a week or topic (course teacher only). */
  function addModule(courseId, payload) {
    return request('/api/courses/' + encodeURIComponent(courseId) + '/modules', { method: 'POST', body: payload });
  }

  /** Update a week or topic (course teacher only). */
  function updateModule(courseId, moduleId, payload) {
    return request('/api/courses/' + encodeURIComponent(courseId) + '/modules/' + encodeURIComponent(moduleId), {
      method: 'PUT',
      body: payload
    });
  }

  /** Delete a week or topic (course teacher only). */
  function deleteModule(courseId, moduleId) {
    return request('/api/courses/' + encodeURIComponent(courseId) + '/modules/' + encodeURIComponent(moduleId), {
      method: 'DELETE'
    });
  }

  /** Upload one or more Office/PDF files into a week (teacher only). */
  function uploadWeekFiles(courseId, moduleId, fileList) {
    const body = new FormData();
    const files = fileList ? Array.prototype.slice.call(fileList) : [];
    files.forEach(function (file) { body.append('files', file); });
    return request('/api/courses/' + encodeURIComponent(courseId) + '/modules/' + encodeURIComponent(moduleId) + '/files', {
      method: 'POST',
      body: body
    });
  }

  /** Files in a course, with dates students may see (teachers also see pending ones). */
  function getCourseFiles(courseId) {
    return request('/api/courses/' + encodeURIComponent(courseId) + '/files');
  }

  function getExtractions(courseId, status) {
    const q = status ? ('?status=' + encodeURIComponent(status)) : '';
    return request('/api/courses/' + encodeURIComponent(courseId) + '/extractions' + q);
  }

  function confirmExtractions(courseId, items) {
    return request('/api/courses/' + encodeURIComponent(courseId) + '/extractions/confirm', {
      method: 'POST',
      body: { items: items }
    });
  }

  function deleteWeekFile(courseId, fileId) {
    return request('/api/courses/' + encodeURIComponent(courseId) + '/files/' + encodeURIComponent(fileId), {
      method: 'DELETE'
    });
  }

  async function downloadWeekFile(courseId, fileId, filename) {
    const token = getToken();
    if (!token) {
      redirectToLogin();
      throw new ApiError('Your session has expired. Please sign in again.', 401, null);
    }
    let res;
    try {
      res = await fetch(API_BASE + '/api/courses/' + encodeURIComponent(courseId) + '/files/' + encodeURIComponent(fileId) + '/download', {
        headers: { Authorization: 'Bearer ' + token }
      });
    } catch (err) {
      throw new ApiError('Could not download that file. Make sure the API is running.', 0, null);
    }
    if (res.status === 401) {
      clearSession();
      redirectToLogin();
      throw new ApiError('Your session has expired. Please sign in again.', 401, null);
    }
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      throw new ApiError(errorMessage(data) || ('Download failed (HTTP ' + res.status + ')'), res.status, data);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'file';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000);
  }

  /** My tasks: [{ id, title, due_date, weighting, course_id, is_completed }] */
  function getTasks() {
    return request('/api/tasks/');
  }

  /** My attendance: [{ date: "YYYY-MM-DD", status }] */
  function getAttendance() {
    return request('/api/attendance/my');
  }

  /** Check in: POST /api/attendance/checkin { status, course_id? } */
  function checkin(status, courseId) {
    const body = { status: status || 'present' };
    if (courseId !== undefined && courseId !== null && courseId !== '') {
      body.course_id = Number(courseId);
    }
    return request('/api/attendance/checkin', {
      method: 'POST',
      body: body
    });
  }

  /** Chatbot (POST /api/chat/) — uses vtcsas_token. */
  function chat(message, sessionId) {
    const body = { message: message };
    if (sessionId) body.session_id = sessionId;
    return request('/api/chat/', { method: 'POST', body: body });
  }

  function getChatHistory(sessionId) {
    const q = sessionId ? ('?session_id=' + encodeURIComponent(sessionId)) : '';
    return request('/api/chat/history' + q);
  }

  function getCalendarEvents() {
    return request('/api/calendar/events');
  }

  function getHolidays() {
    return request('/api/calendar/holidays');
  }

  function createCalendarEvent(payload) {
    return request('/api/calendar/events', { method: 'POST', body: payload });
  }

  function updateCalendarEvent(id, payload) {
    return request('/api/calendar/events/' + encodeURIComponent(id), { method: 'PUT', body: payload });
  }

  function deleteCalendarEvent(id) {
    return request('/api/calendar/events/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  window.Api = {
    ApiError: ApiError,
    getToken: getToken,
    setToken: setToken,
    clearSession: clearSession,
    getUser: getUser,
    setUser: setUser,
    login: login,
    register: register,
    me: me,
    getCourses: getCourses,
    getCourse: getCourse,
    joinCourse: joinCourse,
    createCourse: createCourse,
    updateCourse: updateCourse,
    getModules: getModules,
    addModule: addModule,
    updateModule: updateModule,
    deleteModule: deleteModule,
    uploadWeekFiles: uploadWeekFiles,
    getCourseFiles: getCourseFiles,
    getExtractions: getExtractions,
    confirmExtractions: confirmExtractions,
    deleteWeekFile: deleteWeekFile,
    downloadWeekFile: downloadWeekFile,
    getTasks: getTasks,
    getAttendance: getAttendance,
    checkin: checkin,
    chat: chat,
    getChatHistory: getChatHistory,
    getCalendarEvents: getCalendarEvents,
    getHolidays: getHolidays,
    createCalendarEvent: createCalendarEvent,
    updateCalendarEvent: updateCalendarEvent,
    deleteCalendarEvent: deleteCalendarEvent
  };
})();
