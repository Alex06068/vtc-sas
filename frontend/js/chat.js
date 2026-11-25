/**
 * Chatbot page: load stored history, send messages with vtcsas_token, and
 * keep a normal multi-turn conversation going.
 */
(function () {
  'use strict';

  if (!window.VtcUI.requireAuth()) return;

  const UI = window.VtcUI;
  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  function addMessage(text, isUser) {
    const div = document.createElement('div');
    div.className = 'msg ' + (isUser ? 'user' : 'bot');
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function loadHistory() {
    return window.Api.getChatHistory()
      .then(function (data) {
        const list = (data && data.messages) || [];
        messagesEl.innerHTML = '';
        if (!list.length) {
          addMessage(
            'Hello! I am the VTC academic assistant. Ask me anything, or ask for help with courses, assignments or check-in.',
            false
          );
          return;
        }
        list.forEach(function (item) {
          addMessage(item.content, item.role === 'user');
        });
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        messagesEl.innerHTML = '';
        addMessage(
          'Hello! I am the VTC academic assistant. Ask me anything — I can also help with courses, assignments or check-in.',
          false
        );
      });
  }

  function send() {
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = '';
    addMessage(text, true);
    sendBtn.disabled = true;
    window.Api.chat(text)
      .then(function (data) {
        addMessage((data && data.reply) || 'No reply.', false);
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        addMessage((err && err.message) || 'Could not reach the chatbot.', false);
      })
      .finally(function () {
        sendBtn.disabled = false;
        input.focus();
      });
  }

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      send();
    });
  }

  UI.initNavbar();
  loadHistory().then(function () {
    if (input) input.focus();
  });
})();
