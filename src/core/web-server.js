const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

class WebServer {
  constructor(store, contentParser, options = {}) {
    this.store = store;
    this.contentParser = contentParser;
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.server = null;
    this.staticDir = path.join(__dirname, '..', 'ui');
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      const maxRetries = 10;
      let retryCount = 0;

      const tryPort = (port) => {
        const onError = (err) => {
          if (err.code === 'EADDRINUSE' && retryCount < maxRetries) {
            retryCount++;
            const nextPort = port + 1;
            console.log(`[WebServer] 端口 ${port} 被占用，尝试端口 ${nextPort}...`);
            this.server.removeListener('error', onError);
            tryPort(nextPort);
          } else {
            this.server.removeListener('error', onError);
            reject(err);
          }
        };

        this.server.once('error', onError);

        this.server.listen(port, this.host, () => {
          this.server.removeListener('error', onError);
          this.port = port;
          const addresses = this.getLocalAddresses();
          console.log(`[WebServer] HTTP 服务已启动 (端口 ${port})`);
          console.log(`[WebServer] 本机访问: http://localhost:${port}`);
          for (const addr of addresses) {
            console.log(`[WebServer] 局域网访问: http://${addr}:${port}`);
          }
          resolve(addresses);
        });
      };

      tryPort(this.port);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('[WebServer] HTTP 服务已停止');
    }
  }

  getLocalAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }
    return addresses;
  }

  handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      return this.handleApi(req, res, url);
    }

    // Static file serving
    return this.serveStatic(req, res, pathname);
  }

  async handleApi(req, res, url) {
    const pathname = url.pathname;
    const parts = pathname.split('/').filter(Boolean); // ['api', 'tasks', '123']

    try {
      // Parse body for POST/PUT
      let body = null;
      if (req.method === 'POST' || req.method === 'PUT') {
        body = await this.parseBody(req);
      }

      // GET /api/tasks
      if (parts[1] === 'tasks' && req.method === 'GET' && !parts[2]) {
        const date = url.searchParams.get('date');
        const startDate = url.searchParams.get('start');
        const endDate = url.searchParams.get('end');
        let tasks;
        if (startDate && endDate) {
          tasks = this.store.getTasksByRange(startDate, endDate);
        } else if (date) {
          tasks = this.store.getTasksByDate(date);
        } else {
          tasks = this.store.getAllTasks();
        }
        return this.json(res, { success: true, data: tasks });
      }

      // POST /api/tasks
      if (parts[1] === 'tasks' && req.method === 'POST') {
        const task = this.store.addTask(body || {});
        return this.json(res, { success: true, data: task });
      }

      // PUT /api/tasks/:id
      if (parts[1] === 'tasks' && parts[2] && req.method === 'PUT') {
        const id = parseInt(parts[2]);
        const task = this.store.updateTask(id, body || {});
        return this.json(res, { success: true, data: task });
      }

      // DELETE /api/tasks/:id
      if (parts[1] === 'tasks' && parts[2] && req.method === 'DELETE') {
        const id = parseInt(parts[2]);
        this.store.deleteTask(id);
        return this.json(res, { success: true });
      }

      // GET /api/settings
      if (parts[1] === 'settings' && req.method === 'GET') {
        const settings = this.store.getSettings();
        return this.json(res, { success: true, data: settings });
      }

      // PUT /api/settings
      if (parts[1] === 'settings' && req.method === 'PUT') {
        const settings = this.store.updateSettings(body || {});
        return this.json(res, { success: true, data: settings });
      }

      // POST /api/parse
      if (parts[1] === 'parse' && req.method === 'POST') {
        const { content, type } = body || {};
        if (!this.contentParser) {
          return this.json(res, { success: false, error: '解析器未初始化' }, 500);
        }
        const result = await this.contentParser.parse(content, type || 'manual');
        return this.json(res, { success: true, data: result });
      }

      // GET /api/info
      if (parts[1] === 'info' && req.method === 'GET') {
        return this.json(res, {
          success: true,
          data: {
            version: '1.0.0',
            appName: 'SmartCapture',
            port: this.port,
            addresses: this.getLocalAddresses(),
          }
        });
      }

      // 404
      this.json(res, { success: false, error: 'Not found' }, 404);
    } catch (e) {
      console.error('[WebServer] API error:', e);
      this.json(res, { success: false, error: e.message }, 500);
    }
  }

  parseBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  json(res, data, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  serveStatic(req, res, pathname) {
    // Map URLs to file paths
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(this.staticDir, filePath);

    // Prevent path traversal
    if (!filePath.startsWith(this.staticDir)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }

      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const cacheControl = (ext === '.html' || ext === '.js') ? 'no-cache, must-revalidate' : 'public, max-age=300';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl });
      res.end(content);
    });
  }
}

module.exports = WebServer;