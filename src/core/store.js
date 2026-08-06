const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class Store {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.fallbackPath = null;
    this.db = null;
    this.SQL = null;
  }

  async init() {
    // 明确指定 WASM 文件路径，防止打包后路径解析错误
    const wasmPath = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    console.log('[Store] sql.js WASM 路径:', wasmPath);
    console.log('[Store] WASM 文件存在:', fs.existsSync(wasmPath));

    this.SQL = await initSqlJs({
      locateFile: (file) => {
        if (file === 'sql-wasm.wasm') return wasmPath;
        return file;
      }
    });

    const dir = path.dirname(this.dbPath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (e) {
      console.warn('[Store] 无法创建数据目录，尝试使用备用路径:', e.message);
      this._setupFallbackPath();
    }

    const tryPath = this._getReadablePath();
    if (tryPath && fs.existsSync(tryPath)) {
      try {
        const fileBuffer = fs.readFileSync(tryPath);
        if (fileBuffer.length > 0) {
          this.db = new this.SQL.Database(fileBuffer);
          console.log('[Store] 从', tryPath, '加载数据库');
        } else {
          this.db = new this.SQL.Database();
        }
      } catch (e) {
        console.warn('[Store] 读取数据库文件失败，创建新数据库:', e.message);
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }

    this.db.run('PRAGMA foreign_keys = ON');

    this._createTables();
    this._ensureDefaultSettings();

    console.log('[Store] 数据库初始化完成:', this._getReadablePath());
  }

  _setupFallbackPath() {
    const fallbackDir = path.join(process.cwd(), 'data');
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      this.fallbackPath = path.join(fallbackDir, 'smartcapture.db');
      console.log('[Store] 使用备用路径:', this.fallbackPath);
    } catch (e) {
      console.error('[Store] 备用路径也无法创建，数据将仅保存在内存中');
      this.fallbackPath = null;
    }
  }

  _getReadablePath() {
    if (this.fallbackPath) return this.fallbackPath;
    return this.dbPath;
  }

  _getWritablePath() {
    if (this.fallbackPath) return this.fallbackPath;
    return this.dbPath;
  }

  _save() {
    if (!this.db) return false;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const writablePath = this._getWritablePath();

      try {
        fs.writeFileSync(writablePath, buffer);
        return true;
      } catch (e) {
        if (e.code === 'EPERM' || e.code === 'EACCES') {
          console.warn('[Store] 主路径写入失败，尝试备用路径');
          if (!this.fallbackPath) {
            this._setupFallbackPath();
          }
          if (this.fallbackPath && this.fallbackPath !== writablePath) {
            try {
              fs.writeFileSync(this.fallbackPath, buffer);
              return true;
            } catch (e2) {
              console.error('[Store] 备用路径写入也失败:', e2.message);
            }
          }
        } else {
          console.error('[Store] 保存数据库失败:', e.message);
        }
        return false;
      }
    } catch (e) {
      console.error('[Store] 导出数据库失败:', e.message);
      return false;
    }
  }

  _getLastInsertRowid() {
    if (!this.db) return 0;
    const stmt = this.db.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row.id;
  }

  _getChanges() {
    if (!this.db) return 0;
    const stmt = this.db.prepare('SELECT changes() as count');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row.count;
  }

  _queryAll(sql, params) {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  _queryOne(sql, params) {
    if (!this.db) return null;
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  _queryRun(sql, params) {
    if (!this.db) return { lastInsertRowid: 0, changes: 0 };
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    stmt.step();
    stmt.free();
    return {
      lastInsertRowid: this._getLastInsertRowid(),
      changes: this._getChanges(),
    };
  }

  _createTables() {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'todo',
        dueDate TEXT,
        reminders TEXT DEFAULT '[]',
        location TEXT,
        priority INTEGER NOT NULL DEFAULT 2,
        completed INTEGER NOT NULL DEFAULT 0,
        source TEXT,
        rawText TEXT,
        image TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS task_tags (
        taskId INTEGER NOT NULL,
        tagId INTEGER NOT NULL,
        PRIMARY KEY (taskId, tagId),
        FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_dueDate ON tasks(dueDate);
      CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
      CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
    `);

    // 迁移：为旧表添加 reminders 列（如果不存在）
    try {
      this.db.exec('ALTER TABLE tasks ADD COLUMN reminders TEXT DEFAULT \'[]\'');
    } catch (e) {
      // 列已存在，忽略
    }

    // 迁移：为旧表添加 image 列（截图数据）
    try {
      this.db.exec('ALTER TABLE tasks ADD COLUMN image TEXT');
    } catch (e) {
      // 列已存在，忽略
    }

    this._save();
  }

  _ensureDefaultSettings() {
    if (!this.db) return;
    const defaults = {
      hotkeys: JSON.stringify({
        captureScreenshot: 'CommandOrControl+Shift+A',
        captureRegion: 'CommandOrControl+Shift+S',
        toggleWindow: 'CommandOrControl+Shift+T',
        quickCapture: 'CommandOrControl+Shift+Q',
      }),
      monitorClipboard: 'true',
      clipboardPollInterval: '1000',
      autoParse: 'true',
      autoSave: 'true',
      aiApiKey: '',
      aiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
      aiModel: 'deepseek-chat',
      theme: 'light',
      language: 'zh-CN',
    };

    for (const [key, value] of Object.entries(defaults)) {
      this._queryRun(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    }
    this._save();
  }

  // ============ 任务 CRUD ============

  addTask(task) {
    const now = new Date().toISOString();
    const info = this._queryRun(
      `INSERT INTO tasks (title, type, dueDate, reminders, location, priority, source, rawText, image, completed, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.title,
        task.type || 'todo',
        task.dueDate || null,
        task.reminders ? JSON.stringify(task.reminders) : '[]',
        task.location || null,
        task.priority || 2,
        task.source || 'manual',
        task.rawText || null,
        task.image || null,
        task.completed ? 1 : 0,
        now,
        now,
      ]
    );
    this._save();

    return { id: info.lastInsertRowid, ...task, createdAt: now };
  }

  getAllTasks() {
    const rows = this._queryAll(
      'SELECT * FROM tasks ORDER BY completed ASC, dueDate ASC, id DESC'
    );
    return rows.map(this._mapRow);
  }

  getTask(id) {
    const row = this._queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
    return row ? this._mapRow(row) : null;
  }

  getTasksByDate(date) {
    const rows = this._queryAll(
      `SELECT * FROM tasks
       WHERE (date(dueDate) = date(?) OR date(dueDate) IS NULL)
       ORDER BY completed ASC, priority DESC`,
      [date]
    );
    return rows.map(this._mapRow);
  }

  getTasksByRange(startDate, endDate) {
    const tasks = this.getAllTasks();
    const start = new Date(startDate);
    const end = new Date(endDate);
    return tasks
      .filter(t => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= start && d <= end;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
  }

  updateTask(id, updates) {
    const allowedFields = ['title', 'type', 'dueDate', 'reminders', 'location', 'priority', 'completed', 'image'];
    const sets = [];
    const values = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sets.push(`${field} = ?`);
        if (field === 'completed') {
          values.push(updates[field] ? 1 : 0);
        } else if (field === 'reminders') {
          values.push(JSON.stringify(updates[field] || []));
        } else {
          values.push(updates[field]);
        }
      }
    }

    if (sets.length === 0) return false;

    sets.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this._queryRun(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, values);
    this._save();
    return this.getTask(id);
  }

  deleteTask(id) {
    const info = this._queryRun('DELETE FROM tasks WHERE id = ?', [id]);
    this._save();
    return info.changes > 0;
  }

  getStats() {
    const totalRow = this._queryOne('SELECT COUNT(*) as count FROM tasks');
    const completedRow = this._queryOne('SELECT COUNT(*) as count FROM tasks WHERE completed = 1');
    const total = totalRow ? totalRow.count : 0;
    const completed = completedRow ? completed.count : 0;
    const pending = total - completed;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const tasks = this.getAllTasks();
    const dueToday = tasks.filter(t =>
      !t.completed && t.dueDate &&
      this._toLocalDateStr(new Date(t.dueDate)) === todayStr
    ).length;

    return { total, completed, pending, dueToday };
  }

  _toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  _mapRow(row) {
    let reminders = [];
    try {
      reminders = row.reminders ? JSON.parse(row.reminders) : [];
    } catch {
      reminders = [];
    }

    return {
      id: row.id,
      title: row.title,
      type: row.type,
      dueDate: row.dueDate,
      reminders,
      location: row.location,
      priority: row.priority,
      completed: row.completed === 1,
      source: row.source,
      rawText: row.rawText,
      image: row.image,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ============ 设置管理 ============

  getSettings() {
    const rows = this._queryAll('SELECT key, value FROM settings');
    const settings = {};

    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    return settings;
  }

  updateSettings(newSettings) {
    for (const [key, value] of Object.entries(newSettings)) {
      this._queryRun(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, typeof value === 'string' ? value : JSON.stringify(value)]
      );
    }
    this._save();
    return this.getSettings();
  }

  // ============ 数据库维护 ============

  close() {
    if (this.db) {
      this._save();
      this.db.close();
      console.log('[Store] 数据库已关闭');
    }
  }

  exportData(filePath) {
    const data = {
      tasks: this.getAllTasks(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  }

  importData(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    if (data.tasks) {
      for (const t of data.tasks) {
        this._queryRun(
          `INSERT INTO tasks (title, type, dueDate, reminders, location, priority, completed, source, rawText, image, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.title, t.type, t.dueDate,
            t.reminders ? JSON.stringify(t.reminders) : '[]',
            t.location, t.priority,
            t.completed ? 1 : 0, t.source, t.rawText, t.image || null, t.createdAt, t.updatedAt,
          ]
        );
      }
      this._save();
    }

    return true;
  }
}

module.exports = Store;
