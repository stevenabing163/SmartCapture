class HotkeyManager {
  constructor(globalShortcut) {
    this.globalShortcut = globalShortcut;
    this.registered = new Map();
  }

  registerAll(hotkeyConfig, handlers) {
    this.unregisterAll();

    const defaults = {
      captureScreenshot: 'CommandOrControl+Shift+A',
      captureRegion: 'CommandOrControl+Shift+S',
      toggleWindow: 'CommandOrControl+Shift+T',
      quickCapture: 'CommandOrControl+Shift+Q',
    };

    const config = { ...defaults, ...hotkeyConfig };
    let successCount = 0;

    for (const [action, accelerator] of Object.entries(config)) {
      if (handlers[action]) {
        const ok = this.register(accelerator, handlers[action]);
        if (ok) successCount++;
      }
    }

    console.log(`[HotkeyManager] 注册完成: ${successCount}/${Object.keys(config).length} 个快捷键`);
    return successCount > 0;
  }

  register(accelerator, handler) {
    try {
      this.globalShortcut.unregister(accelerator);
      const success = this.globalShortcut.register(accelerator, handler);
      if (success) {
        this.registered.set(accelerator, handler);
        console.log(`[HotkeyManager] 注册成功: ${accelerator}`);
      } else {
        console.warn(`[HotkeyManager] 注册失败: ${accelerator} (可能已被其他应用占用)`);
      }
      return success;
    } catch (err) {
      console.error(`[HotkeyManager] 注册异常 ${accelerator}:`, err.message);
      return false;
    }
  }

  unregister(accelerator) {
    if (this.registered.has(accelerator)) {
      this.globalShortcut.unregister(accelerator);
      this.registered.delete(accelerator);
    }
  }

  unregisterAll() {
    this.globalShortcut.unregisterAll();
    this.registered.clear();
    console.log('[HotkeyManager] 已注销所有快捷键');
  }

  getRegistered() {
    return Array.from(this.registered.keys());
  }
}

module.exports = HotkeyManager;