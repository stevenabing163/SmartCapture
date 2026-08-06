const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 剪贴板
  onClipboardUpdate: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on('clipboard:update', handler);
    return () => ipcRenderer.removeListener('clipboard:update', handler);
  },
  startClipboard: () => ipcRenderer.invoke('clipboard:start'),
  stopClipboard: () => ipcRenderer.invoke('clipboard:stop'),
  manualClipboardCapture: () => ipcRenderer.invoke('clipboard:manualCapture'),

  // 截图
  captureScreenshot: () => ipcRenderer.invoke('screenshot:capture'),
  captureRegion: () => ipcRenderer.invoke('screenshot:capture'),
  captureFull: () => ipcRenderer.invoke('screenshot:captureFull'),
  onScreenshotTaken: (callback) => {
    const handler = (_event, dataUrl) => callback(dataUrl);
    ipcRenderer.on('screenshot:taken', handler);
    return () => ipcRenderer.removeListener('screenshot:taken', handler);
  },

  // 任务管理
  getTasks: () => ipcRenderer.invoke('tasks:getAll'),
  addTask: (task) => ipcRenderer.invoke('tasks:add', task),
  updateTask: (id, updates) => ipcRenderer.invoke('tasks:update', id, updates),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  getTasksByDate: (date) => ipcRenderer.invoke('tasks:getByDate', date),
  getTasksByRange: (start, end) => ipcRenderer.invoke('tasks:getByRange', start, end),

  // 内容解析
  parseContent: (content, type) => ipcRenderer.invoke('parser:parse', content, type),
  testAIConnection: () => ipcRenderer.invoke('parser:testConnection'),

  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // 热键
  registerHotkeys: (config) => ipcRenderer.invoke('hotkey:register', config),

  // 数据管理
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),

  // 通知
  notify: (title, body) => ipcRenderer.invoke('notification:show', title, body),

  // 提醒管理
  startReminder: () => ipcRenderer.invoke('reminder:start'),
  stopReminder: () => ipcRenderer.invoke('reminder:stop'),
  checkReminderNow: () => ipcRenderer.invoke('reminder:checkNow'),

  // 窗口控制
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  showWindow: () => ipcRenderer.invoke('window:show'),

  // Web 服务
  getWebServerInfo: () => ipcRenderer.invoke('webserver:getInfo'),
});