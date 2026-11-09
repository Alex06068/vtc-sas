/**
 * Front-end configuration.
 *
 * Default resolution order:
 *   1. Same-origin deployment (frontend copied into backend/static, served from
 *      127.0.0.1:8000) -> empty base, requests go to /api/... on the same origin.
 *   2. A separate static server on this machine (e.g. http://127.0.0.1:5500)
 *      -> point back to http://127.0.0.1:8000.
 *   3. Opening the HTML files directly (file://) -> same, http://127.0.0.1:8000.
 *
 * If the backend lives somewhere else, just set API_BASE to that origin,
 * for example "http://192.168.1.10:9000".
 */
window.APP_CONFIG = {
  API_BASE: (function () {
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    const port = window.location.port;

    if (protocol === 'file:') {
      return 'http://127.0.0.1:8000';
    }

    const isLocal = host === '127.0.0.1' || host === 'localhost';
    if (isLocal && port && port !== '8000') {
      return 'http://127.0.0.1:8000';
    }

    return '';
  })()
};
