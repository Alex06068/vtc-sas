/**
 * 前端配置。
 *
 * 默认规则（一般不用改）：
 *   1. 同源部署（把 frontend 内容放进 backend/static/，从 127.0.0.1:8000 访问）→ 空字符串，走 /api/... 相对路径；
 *   2. 本机用独立静态服务器跑前端（例如 http://127.0.0.1:5500）→ 自动指向 http://127.0.0.1:8000；
 *   3. 直接双击打开 html（file://）→ 同样指向 http://127.0.0.1:8000。
 *
 * 如果后端不在本机 8000 端口（例如部署到服务器 / 换成 9000），
 * 就把 API_BASE 直接写成后端地址，例如 "http://192.168.1.10:9000"。
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
