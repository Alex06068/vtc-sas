/**
 * VTC-SAS API 客户端。
 * 所有接口都需要登录后带 Authorization: Bearer <token>。
 * 登录接口例外：POST /api/auth/login 用 form 表单提交 username + password。
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

  /* ---------------- 会话 ---------------- */

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* 隐私模式下忽略 */ }
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

  /* ---------------- 响应解析 ---------------- */

  function errorMessage(data) {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (data.detail !== undefined) {
      if (Array.isArray(data.detail)) {
        return data.detail
          .map(function (item) { return (item && item.msg) || String(item); })
          .join('；');
      }
      return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    }
    if (data.message) return String(data.message);
    return '';
  }

  /**
   * 统一请求封装。
   * @param {string} path  以 / 开头的后端路径
   * @param {{method?:string, body?:*, form?:boolean, auth?:boolean}} options
   */
  async function request(path, options) {
    const opts = options || {};
    const method = opts.method || 'GET';
    const headers = {};
    let payload;

    if (opts.body !== undefined && opts.body !== null) {
      if (opts.form) {
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
        throw new ApiError('登录状态已失效，请重新登录。', 401, null);
      }
      headers.Authorization = 'Bearer ' + token;
    }

    let res;
    try {
      res = await fetch(API_BASE + path, { method: method, headers: headers, body: payload });
    } catch (err) {
      throw new ApiError(
        '无法连接后端服务。请检查 js/config.js 里的 API_BASE 以及后端是否已启动。',
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
      throw new ApiError('登录状态已过期，请重新登录。', 401, data);
    }

    if (!res.ok) {
      throw new ApiError(errorMessage(data) || ('请求失败（HTTP ' + res.status + '）'), res.status, data);
    }

    return data;
  }

  /* ---------------- 具体接口 ---------------- */

  /** 登录（form 表单：username + password），成功后把 token 存入 localStorage。 */
  async function login(username, password) {
    const data = await request('/api/auth/login', {
      method: 'POST',
      form: true,
      auth: false,
      body: { username: username, password: password }
    });
    const token = data && (data.access_token || data.token);
    if (!token) {
      throw new ApiError('登录响应里没有 access_token，请检查后端 /api/auth/login。', 0, data);
    }
    setToken(token);
    setUser({ username: username });
    return data;
  }

  /** 注册（JSON：username + email + password + role），成功后同样返回 token。 */
  async function register(payload) {
    const data = await request('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: payload
    });
    const token = data && (data.access_token || data.token);
    if (!token) {
      throw new ApiError('注册成功但响应里没有 access_token。', 0, data);
    }
    setToken(token);
    setUser({ username: payload.username, role: payload.role });
    return data;
  }

  /** 当前登录用户：{ id, username, email, role } */
  function me() {
    return request('/api/auth/me');
  }

  /** 已加入的课程列表：[{ id, code, name, description, teacher_id, ... }] */
  function getCourses() {
    return request('/api/courses/my');
  }

  /** 加入课程：POST /api/courses/join/{course_code} */
  function joinCourse(courseCode) {
    return request('/api/courses/join/' + encodeURIComponent(courseCode), { method: 'POST' });
  }

  /** 创建课程（需要教师角色）：body { code, name, description? } */
  function createCourse(payload) {
    return request('/api/courses/', { method: 'POST', body: payload });
  }

  /** 我的作业：[{ id, title, due_date, weighting, course_id, is_completed, source }] */
  function getTasks() {
    return request('/api/tasks/');
  }

  /** 我的出席记录：[{ date: "YYYY-MM-DD", status }] */
  function getAttendance() {
    return request('/api/attendance/my');
  }

  /** 签到：POST /api/attendance/checkin  body { status: "present" } */
  function checkin(status) {
    return request('/api/attendance/checkin', {
      method: 'POST',
      body: { status: status || 'present' }
    });
  }

  /** Chatbot：POST /api/chat/  body { message }（本前端暂未使用，留作扩展） */
  function chat(message) {
    return request('/api/chat/', { method: 'POST', body: { message: message } });
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
    joinCourse: joinCourse,
    createCourse: createCourse,
    getTasks: getTasks,
    getAttendance: getAttendance,
    checkin: checkin,
    chat: chat
  };
})();
