/**
 * 登录 / 注册页。登录成功把 access_token 存入 localStorage 后进入 Dashboard。
 */
(function () {
  'use strict';

  if (window.Api && window.Api.getToken()) {
    window.location.replace('index.html');
    return;
  }

  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');

  const registerSwitch = document.getElementById('register-switch');
  const registerForm = document.getElementById('register-form');
  const registerError = document.getElementById('register-error');
  const registerSubmit = document.getElementById('register-submit');

  const loginFootText = document.getElementById('login-foot-text');
  const registerFootText = document.getElementById('register-foot-text');
  const showRegister = document.getElementById('show-register');
  const showLogin = document.getElementById('show-login');

  /* ---------------- 小工具 ---------------- */

  function showFormError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
  }

  function hideFormError(el) {
    if (!el) return;
    el.classList.remove('show');
    el.textContent = '';
  }

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = busyText || '请稍候…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  function switchToRegister() {
    loginForm.classList.add('hide');
    registerSwitch.classList.add('show');
    loginFootText.classList.add('hide');
    registerFootText.classList.add('show');
    hideFormError(loginError);
  }

  function switchToLogin() {
    loginForm.classList.remove('hide');
    registerSwitch.classList.remove('show');
    loginFootText.classList.remove('hide');
    registerFootText.classList.remove('show');
    hideFormError(registerError);
  }

  /* ---------------- 切换表单 ---------------- */

  if (showRegister) showRegister.addEventListener('click', switchToRegister);
  if (showLogin) showLogin.addEventListener('click', switchToLogin);

  /* ---------------- 登录 ---------------- */

  if (loginForm) {
    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hideFormError(loginError);

      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;

      if (!username || !password) {
        showFormError(loginError, '请输入用户名和密码。');
        return;
      }

      setBusy(loginSubmit, true, '登录中…');
      window.Api.login(username, password)
        .then(function () {
          window.location.replace('index.html');
        })
        .catch(function (err) {
          showFormError(loginError, (err && err.message) || '登录失败，请检查用户名和密码。');
          setBusy(loginSubmit, false);
        });
    });
  }

  /* ---------------- 注册 ---------------- */

  if (registerForm) {
    registerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      hideFormError(registerError);

      const username = document.getElementById('register-username').value.trim();
      const email = document.getElementById('register-email').value.trim();
      const password = document.getElementById('register-password').value;
      const role = document.getElementById('register-role').value;

      if (!username || !email || !password) {
        showFormError(registerError, '用户名、邮箱和密码都需要填写。');
        return;
      }

      setBusy(registerSubmit, true, '注册中…');
      window.Api.register({ username: username, email: email, password: password, role: role })
        .then(function () {
          window.location.replace('index.html');
        })
        .catch(function (err) {
          showFormError(registerError, (err && err.message) || '注册失败，请稍后重试。');
          setBusy(registerSubmit, false);
        });
    });
  }
})();
