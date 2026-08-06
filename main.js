const {
  app, BrowserWindow, ipcMain, globalShortcut, clipboard,
  desktopCapturer, Tray, Menu, nativeImage, Notification, screen, dialog
} = require('electron');
const path = require('path');
const fs = require('fs');

// ============ 日志系统（落盘到 data/logs/）============
let logStream = null;
let logDir = null;

function initLogger() {
  try {
    const dataDir = app.isPackaged
      ? path.join(path.dirname(app.getPath('exe')), 'data')
      : path.join(__dirname, 'data');
    logDir = path.join(dataDir, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'smartcapture.log');
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...args) => {
      origLog(...args);
      writeLog('INFO', args);
    };
    console.error = (...args) => {
      origErr(...args);
      writeLog('ERROR', args);
    };
    console.warn = (...args) => {
      origErr(...args);
      writeLog('WARN', args);
    };
    console.log('[Logger] 日志系统已启动:', logFile);
  } catch (e) {
    // 日志系统失败不影响应用启动
  }
}

function writeLog(level, args) {
  if (!logStream) return;
  try {
    const ts = new Date().toISOString();
    const msg = args.map(a => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') return JSON.stringify(a, null, 0).slice(0, 500);
      return String(a);
    }).join(' ');
    logStream.write(`[${ts}] [${level}] ${msg}\n`);
  } catch (_) {}
}

function safeLog(...args) {
  try { console.log(...args); } catch (_) {}
}

// ============ 带超时的异步执行 ============
function withTimeout(promiseFn, timeoutMs, label) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      safeLog(`[${label}] 超时 (${timeoutMs}ms)`);
      resolve({ error: 'timeout' });
    }, timeoutMs);
    Promise.resolve()
      .then(() => promiseFn())
      .then(result => {
        clearTimeout(timer);
        resolve({ result });
      })
      .catch(err => {
        clearTimeout(timer);
        safeLog(`[${label}] 异常:`, err?.message || err);
        resolve({ error: err?.message || String(err) });
      });
  });
}

// ============ 模块加载 ============
safeLog('[Boot] SmartCapture starting...');
safeLog('[Boot] app.isPackaged:', app.isPackaged);
safeLog('[Boot] process.resourcesPath:', process.resourcesPath);

let ClipboardMonitor, ScreenshotCapture, HotkeyManager, TrayManager, ContentParser, Store, WebServer;
let moduleLoadError = null;

try {
  ClipboardMonitor = require('./src/core/clipboard');
  safeLog('[Boot] clipboard.js loaded');
  ScreenshotCapture = require('./src/core/screenshot');
  safeLog('[Boot] screenshot.js loaded');
  HotkeyManager = require('./src/core/hotkey');
  safeLog('[Boot] hotkey.js loaded');
  TrayManager = require('./src/core/tray');
  safeLog('[Boot] tray.js loaded');
  ContentParser = require('./src/core/parser');
  safeLog('[Boot] parser.js loaded');
  Store = require('./src/core/store');
  safeLog('[Boot] store.js loaded');
  WebServer = require('./src/core/web-server');
  safeLog('[Boot] web-server.js loaded');
} catch (e) {
  safeLog('[Boot] 模块加载失败:', e?.message || e);
  safeLog('[Boot] stack:', e?.stack);
  moduleLoadError = e?.message || String(e);
}

let mainWindow = null;
let tray = null;
let clipboardMonitor = null;
let screenshotCapture = null;
let hotkeyManager = null;
let trayManager = null;
let contentParser = null;
let store = null;
let webServer = null;
let webAddresses = [];
let reminderTimer = null;
const notifiedTasks = new Set();

// ============ 任务提醒 ============

function startReminderChecker() {
  if (reminderTimer) clearInterval(reminderTimer);
  checkReminders();
  reminderTimer = setInterval(checkReminders, 60 * 1000); // 每分钟检查一次
  console.log('[Reminder] 提醒检查已启动 (每分钟)');
}

function stopReminderChecker() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
  console.log('[Reminder] 提醒检查已停止');
}

function checkReminders() {
  if (!store) return;

  try {
    const settings = store.getSettings() || {};
    if (settings.enableReminders === false) return;

    const allTasks = store.getAllTasks();
    const now = Date.now();
    const globalAdvance = settings.reminderAdvanceMinutes || 15;

    for (const task of allTasks) {
      if (!task.dueDate || task.completed) continue;

      const dueTime = new Date(task.dueDate).getTime();
      if (isNaN(dueTime)) continue;

      const timeDiff = dueTime - now; // 正数=还没到，负数=已过期
      const taskId = task.id;

      // 任务有独立提醒设置时，使用每个提醒时间
      if (task.reminders && task.reminders.length > 0) {
        for (const offsetMin of task.reminders) {
          const reminderTime = dueTime - offsetMin * 60 * 1000;
          const reminderKey = `${taskId}:${offsetMin}`;
          const diff = reminderTime - now;

          if (diff <= 0 && !notifiedTasks.has(reminderKey)) {
            notifiedTasks.add(reminderKey);
            if (offsetMin === 0) {
              sendNotification(
                '⏰ 任务到期',
                `"${task.title}" 现在到期了`
              );
              console.log(`[Reminder] 到期提醒: ${task.title}`);
            } else {
              sendNotification(
                '🔔 任务提醒',
                `"${task.title}" 将在 ${offsetMin} 分钟后到期`
              );
              console.log(`[Reminder] ${offsetMin}分钟前提醒: ${task.title}`);
            }
          }
        }
      } else {
        // 使用全局提醒设置
        if (timeDiff < 0 && !notifiedTasks.has(taskId)) {
          notifiedTasks.add(taskId);
          sendNotification(
            '⏰ 任务已过期',
            `"${task.title}" 的截止日期已过 ${formatDuration(-timeDiff)}`
          );
          console.log(`[Reminder] 过期提醒: ${task.title}`);
        } else if (timeDiff > 0 && timeDiff <= globalAdvance * 60 * 1000 && !notifiedTasks.has(taskId)) {
          notifiedTasks.add(taskId);
          sendNotification(
            '🔔 任务即将到期',
            `"${task.title}" 将在 ${formatDuration(timeDiff)} 后到期`
          );
          console.log(`[Reminder] 即将到期提醒: ${task.title}`);
        }
      }
    }
  } catch (e) {
    // 静默失败
  }
}

function sendNotification(title, body) {
  try {
    const notif = new Notification({ title, body, silent: false });
    notif.on('click', () => showMainWindow());
    notif.show();
  } catch (e) {
    // 某些系统可能不支持通知
  }
}

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} 分钟`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时 ${mins % 60} 分钟`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

// ============ 应用初始化（带超时保护）============

function resolveDataPath() {
  if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'));
    return path.join(exeDir, 'data', 'smartcapture.db');
  } else {
    return path.join(__dirname, 'data', 'smartcapture.db');
  }
}

async function initialize() {
  safeLog('[Init] 开始初始化...');
  const dbPath = resolveDataPath();
  safeLog('[Init] 数据库路径:', dbPath);

  // 步骤 1: Store 初始化（最多 10 秒）
  safeLog('[Init] 步骤 1: Store 初始化');
  const storeResult = await withTimeout(async () => {
    if (moduleLoadError) throw new Error('模块加载失败: ' + moduleLoadError);
    store = new Store(dbPath);
    await store.init();
  }, 10000, 'Store');

  if (storeResult.error) {
    safeLog('[Init] Store 初始化失败:', storeResult.error);
    // 尝试用备用方式继续
  } else {
    safeLog('[Init] Store 初始化成功');
  }

  // 步骤 2: 获取设置（最多 3 秒）
  safeLog('[Init] 步骤 2: 加载设置');
  let settings = {};
  try {
    if (store) {
      const s = await withTimeout(() => store.getSettings(), 3000, 'GetSettings');
      if (!s.error) settings = s.result || {};
    }
  } catch (e) {
    safeLog('[Init] 获取设置失败，使用默认配置');
  }

  // 步骤 3: 初始化各模块
  safeLog('[Init] 步骤 3: 初始化功能模块');
  try {
    if (ContentParser && store) {
      contentParser = new ContentParser(store);
      safeLog('[Init] ContentParser 就绪');
    }
  } catch (e) {
    safeLog('[Init] ContentParser 初始化失败:', e?.message);
  }

  try {
    if (ClipboardMonitor) {
      clipboardMonitor = new ClipboardMonitor(clipboard);
      clipboardMonitor.on('content', (text, source) => {
        if (mainWindow) {
          mainWindow.webContents.send('clipboard:update', { text, source });
        }
      });
      if (settings.monitorClipboard !== false) {
        clipboardMonitor.start();
      }
      safeLog('[Init] ClipboardMonitor 就绪');
    }
  } catch (e) {
    safeLog('[Init] ClipboardMonitor 初始化失败:', e?.message);
  }

  try {
    if (ScreenshotCapture) {
      screenshotCapture = new ScreenshotCapture(desktopCapturer, screen);
      screenshotCapture.on('screenshot', (dataUrl) => {
        if (mainWindow) {
          mainWindow.webContents.send('screenshot:taken', dataUrl);
        }
      });
      safeLog('[Init] ScreenshotCapture 就绪');
    }
  } catch (e) {
    safeLog('[Init] ScreenshotCapture 初始化失败:', e?.message);
  }

  try {
    if (HotkeyManager) {
      hotkeyManager = new HotkeyManager(globalShortcut);
      const hotkeyConfig = settings.hotkeys || {};
      hotkeyManager.registerAll(hotkeyConfig, {
        captureScreenshot: () => screenshotCapture?.captureFullScreen(),
        captureRegion: () => screenshotCapture?.captureRegion(),
        toggleWindow: () => {
          if (mainWindow && mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            showMainWindow();
          }
        },
        quickCapture: () => screenshotCapture?.captureRegion(),
      });
      safeLog('[Init] HotkeyManager 就绪');
    }
  } catch (e) {
    safeLog('[Init] HotkeyManager 初始化失败:', e?.message);
  }

  try {
    if (TrayManager) {
      trayManager = new TrayManager(Tray, Menu, nativeImage, app);
      trayManager.on('show-window', showMainWindow);
      trayManager.on('capture-screenshot', () => screenshotCapture?.captureRegion());
      trayManager.on('capture-region', () => screenshotCapture?.captureRegion());
      trayManager.on('quit', () => {
        app.isQuitting = true;
        if (store) store.close();
        app.quit();
      });
      trayManager.create();
      safeLog('[Init] TrayManager 就绪');
    }
  } catch (e) {
    safeLog('[Init] TrayManager 初始化失败:', e?.message);
  }

  // 步骤 4: Web 服务（最多 5 秒，非关键）
  safeLog('[Init] 步骤 4: 启动 Web 服务');
  if (WebServer && store) {
    const wsResult = await withTimeout(async () => {
      webServer = new WebServer(store, contentParser, { port: 3000 });
      webAddresses = await webServer.start();
    }, 5000, 'WebServer');
    if (wsResult.error) {
      safeLog('[Init] Web 服务启动失败（非关键）:', wsResult.error);
      webAddresses = [];
    } else {
      safeLog('[Init] Web 服务就绪:', webAddresses);
    }
  }

  // 步骤 5: 启动提醒检查
  safeLog('[Init] 步骤 5: 启动提醒检查');
  startReminderChecker();

  safeLog('[Init] 初始化完成');
}

// ============ 主窗口 ============

function createMainWindow() {
  safeLog('[Window] 创建主窗口...');
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    frame: true,
    title: 'SmartCapture — 智能待办捕获',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const htmlPath = path.join(__dirname, 'src/ui/index.html');
  safeLog('[Window] 加载页面:', htmlPath);

  mainWindow.loadFile(htmlPath).then(() => {
    safeLog('[Window] 页面加载成功');
  }).catch((err) => {
    safeLog('[Window] 页面加载失败:', err?.message || err);
  });

  mainWindow.setMenuBarVisibility(false);

  // 窗口加载失败事件
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    safeLog('[Window] did-fail-load:', { errorCode, errorDescription, validatedURL });
    // 显示错误页面
    try {
      mainWindow.loadURL(`data:text/html,
        <h2 style="color:#e74c3c;padding:20px">SmartCapture 启动失败</h2>
        <p style="padding:0 20px">错误码: ${errorCode}</p>
        <p style="padding:0 20px">描述: ${errorDescription}</p>
        <p style="padding:0 20px;margin-top:20px">请查看 data/logs/smartcapture.log 获取详细日志</p>
      `);
    } catch (_) {}
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    safeLog('[Window] render-process-gone:', details?.reason, details?.exitCode);
  });

  mainWindow.webContents.on('unresponsive', () => {
    safeLog('[Window] 渲染进程无响应');
  });

  // 转发渲染进程日志到主进程日志
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const prefix = level === 2 ? '[Renderer Error]' : level === 1 ? '[Renderer Warn]' : '[Renderer]';
    safeLog(`${prefix} ${message} (${sourceId}:${line})`);
  });

  // 开发模式打开 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('show', () => {
    safeLog('[Window] 窗口显示');
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (!mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    if (process.platform === 'win32') {
      mainWindow.setSkipTaskbar(false);
    }
  }
}

// ============ IPC 通信处理 ============

function setupIpc() {
  // 任务 CRUD
  ipcMain.handle('tasks:getAll', () => {
    if (!store) return [];
    return store.getAllTasks();
  });
  ipcMain.handle('tasks:add', (_e, task) => {
    if (!store) return { id: 0 };
    return store.addTask(task);
  });
  ipcMain.handle('tasks:update', (_e, id, updates) => {
    if (!store) return { changes: 0 };
    return store.updateTask(id, updates);
  });
  ipcMain.handle('tasks:delete', (_e, id) => {
    if (!store) return { changes: 0 };
    return store.deleteTask(id);
  });
  ipcMain.handle('tasks:getByDate', (_e, date) => {
    if (!store) return [];
    return store.getTasksByDate(date);
  });
  ipcMain.handle('tasks:getByRange', (_e, startDate, endDate) => {
    if (!store) return [];
    return store.getTasksByRange(startDate, endDate);
  });

  // 内容解析
  ipcMain.handle('parser:parse', async (_e, content, type) => {
    if (!contentParser) return { error: '解析器未初始化' };
    return await contentParser.parse(content, type);
  });
  ipcMain.handle('parser:testConnection', async () => {
    if (!contentParser) return { success: false, error: '解析器未初始化' };
    return await contentParser.testConnection();
  });

  // 设置
  ipcMain.handle('settings:get', () => {
    if (!store) return {};
    return store.getSettings();
  });
  ipcMain.handle('settings:update', (_e, settings) => {
    if (!store) return false;
    return store.updateSettings(settings);
  });

  // 截图
  ipcMain.handle('screenshot:capture', async () => {
    if (!screenshotCapture) return null;
    return await screenshotCapture.captureRegion();
  });
  ipcMain.handle('screenshot:captureFull', async () => {
    if (!screenshotCapture) return null;
    return await screenshotCapture.captureFullScreen();
  });

  // 剪贴板控制
  ipcMain.handle('clipboard:start', () => {
    if (clipboardMonitor) {
      clipboardMonitor.start();
      clipboardMonitor.updateConfig({ monitorText: true });
      return true;
    }
    return false;
  });

  ipcMain.handle('clipboard:stop', () => {
    if (clipboardMonitor) {
      clipboardMonitor.stop();
      return true;
    }
    return false;
  });

  ipcMain.handle('clipboard:manualCapture', () => {
    if (clipboardMonitor) {
      return clipboardMonitor.manualCapture();
    }
    return null;
  });

  // 热键控制
  ipcMain.handle('hotkey:register', (_e, hotkeyConfig) => {
    if (!hotkeyManager) return false;
    hotkeyManager.unregisterAll();
    const defaults = {
      captureScreenshot: 'CommandOrControl+Shift+A',
      captureRegion: 'CommandOrControl+Shift+S',
      toggleWindow: 'CommandOrControl+Shift+T',
      quickCapture: 'CommandOrControl+Shift+Q',
    };
    const config = { ...defaults, ...hotkeyConfig };
    return hotkeyManager.registerAll(config, {
      captureScreenshot: () => screenshotCapture.captureRegion(),
      captureRegion: () => screenshotCapture.captureRegion(),
      toggleWindow: () => {
        if (mainWindow && mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          showMainWindow();
        }
      },
      quickCapture: () => screenshotCapture.captureRegion(),
    });
  });
  ipcMain.handle('data:export', async () => {
    const tasks = store ? store.getAllTasks() : [];
    const settings = store ? (store.getSettings() || {}) : {};
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
      settings,
    };

    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出数据',
      defaultPath: `smartcapture-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) return { success: false, error: '已取消' };

    try {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('data:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入数据',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, error: '已取消' };
    }

    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
      const data = JSON.parse(raw);

      if (data.tasks && Array.isArray(data.tasks)) {
        for (const task of data.tasks) {
          if (task.title) {
            store?.addTask(task);
          }
        }
      }
      if (data.settings && store) {
        store.updateSettings(data.settings);
      }

      return { success: true, taskCount: data.tasks?.length || 0 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 通知
  ipcMain.handle('notification:show', (_e, title, body) => {
    new Notification({ title, body, silent: false }).show();
  });

  // 提醒管理
  ipcMain.handle('reminder:start', () => {
    startReminderChecker();
    return true;
  });
  ipcMain.handle('reminder:stop', () => {
    stopReminderChecker();
    return true;
  });
  ipcMain.handle('reminder:checkNow', () => {
    notifiedTasks.clear(); // 重置通知记录，允许重新提醒
    checkReminders();
    return true;
  });

  // 窗口控制
  ipcMain.handle('window:hide', () => {
    if (mainWindow) mainWindow.hide();
  });
  ipcMain.handle('window:show', () => showMainWindow());

  // Web 服务信息
  ipcMain.handle('webserver:getInfo', () => {
    return {
      port: webServer ? webServer.port : 3000,
      addresses: webAddresses,
      running: !!webServer,
    };
  });
}

// ============ 应用生命周期 ============

app.whenReady().then(async () => {
  // 初始化日志系统（最早执行）
  initLogger();
  safeLog('[App] whenReady fired');
  safeLog('[App] Electron version:', process.versions.electron);
  safeLog('[App] Node version:', process.version);
  safeLog('[App] Resources path:', process.resourcesPath);
  safeLog('[App] App path:', app.getAppPath());

  // 先注册 IPC 处理器（带空值检查，允许在模块初始化完成前调用）
  safeLog('[App] 注册 IPC...');
  setupIpc();
  safeLog('[App] IPC 已注册');

  // 创建窗口（IPC 已就绪）
  createMainWindow();
  safeLog('[App] 主窗口已创建');

  // 后台初始化（不阻塞窗口显示）
  safeLog('[App] 开始后台初始化...');
  const initResult = await withTimeout(initialize, 20000, 'TotalInit');

  if (initResult.error) {
    safeLog('[App] 初始化超时或失败，但窗口仍可用');
  } else {
    safeLog('[App] 全部初始化完成');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on('will-quit', () => {
  app.isQuitting = true;
  try { if (webServer) webServer.stop(); } catch (_) {}
  try { if (hotkeyManager) hotkeyManager.unregisterAll(); } catch (_) {}
  try { if (clipboardMonitor) clipboardMonitor.stop(); } catch (_) {}
  try { if (store) store.close(); } catch (_) {}
  safeLog('[App] will-quit: 清理完成');
  if (logStream) {
    try { logStream.end(); } catch (_) {}
  }
});

app.on('window-all-closed', (e) => {
  if (app.isQuitting) return;
  e.preventDefault();
});

// 全局异常捕获（防止静默崩溃）
process.on('uncaughtException', (err) => {
  safeLog('[CRASH] uncaughtException:', err?.message);
  safeLog('[CRASH] stack:', err?.stack);
});

process.on('unhandledRejection', (reason) => {
  safeLog('[CRASH] unhandledRejection:', reason?.message || reason);
});