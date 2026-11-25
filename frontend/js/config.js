/**
 * Front-end configuration.
 *
 * Default resolution order:
 *   1. Same-origin deployment (pages served by FastAPI on port 8000, or a
 *      Codespaces / github.dev forward of that port) -> empty base, requests
 *      go to /api/... on the same origin.
 *   2. A separate static server on this machine (e.g. http://127.0.0.1:5500)
 *      -> point back to http://127.0.0.1:8000.
 *   3. A Codespaces forward of a non-8000 port (port is in the hostname)
 *      -> point at the same codespace's 8000 forward.
 *   4. Opening the HTML files directly (file://) -> http://127.0.0.1:8000.
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

    // Codespaces / github.dev: <name>-<port>.app.github.dev
    const preview = host.match(/^(.*)-(\d+)\.(app\.github\.dev|githubpreview\.dev|preview\.app\.github\.dev)$/);
    if (preview && preview[2] !== '8000') {
      return protocol + '//' + preview[1] + '-8000.' + preview[3];
    }

    return '';
  })()
};
