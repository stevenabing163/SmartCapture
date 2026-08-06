const EventEmitter = require('events');

class ClipboardMonitor extends EventEmitter {
  constructor(clipboard) {
    super();
    this.clipboard = clipboard;
    this.interval = null;
    this.lastText = '';
    this.lastImageHash = '';
    this.config = {
      pollInterval: 1000,
      monitorText: true,
      monitorImage: true,
      minTextLength: 2,
      ignoreUrls: false,
    };
  }

  start() {
    if (this.interval) return;

    this.interval = setInterval(() => {
      this._checkClipboard();
    }, this.config.pollInterval);

    console.log('[ClipboardMonitor] 已启动，轮询间隔:', this.config.pollInterval, 'ms');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[ClipboardMonitor] 已停止');
    }
  }

  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    if (this.interval && newConfig.pollInterval) {
      this.stop();
      this.start();
    }
  }

  _checkClipboard() {
    try {
      if (this.config.monitorText) {
        const text = this.clipboard.readText().trim();
        if (text && text.length >= this.config.minTextLength && text !== this.lastText) {
          this.lastText = text;
          this.emit('content', text, 'clipboard');
        }
      }
    } catch (err) {
      console.error('[ClipboardMonitor] 读取剪贴板失败:', err.message);
    }
  }

  // 手动触发捕获（用户主动操作时调用）
  manualCapture() {
    const text = this.clipboard.readText().trim();
    if (text) {
      this.emit('content', text, 'manual');
      return text;
    }
    return null;
  }
}

module.exports = ClipboardMonitor;