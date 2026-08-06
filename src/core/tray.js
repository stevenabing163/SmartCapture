const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class TrayManager extends EventEmitter {
  constructor(Tray, Menu, nativeImage, app) {
    super();
    this.Tray = Tray;
    this.Menu = Menu;
    this.nativeImage = nativeImage;
    this.app = app;
    this.tray = null;
  }

  create() {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    let icon;

    if (fs.existsSync(iconPath)) {
      icon = this.nativeImage.createFromPath(iconPath);
    } else {
      // 创建一个简单的彩色图标（使用 base64 内联）
      icon = this.nativeImage.createFromDataURL(
        'data:image/svg+xml;base64,' + Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
          '<rect width="16" height="16" rx="3" fill="#4A90D9"/>' +
          '<text x="8" y="13" font-size="10" fill="white" text-anchor="middle" font-family="Arial" font-weight="bold">待</text>' +
          '</svg>'
        ).toString('base64')
      );
    }

    this.tray = new this.Tray(icon);
    this.tray.setToolTip('SmartCapture — 智能待办捕获');

    const contextMenu = this.Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => this.emit('show-window') },
      { type: 'separator' },
      { label: '全屏截图', click: () => this.emit('capture-screenshot') },
      { label: '区域截图', click: () => this.emit('capture-region') },
      { type: 'separator' },
      {
        label: '开机自启动',
        type: 'checkbox',
        checked: this.app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          this.app.setLoginItemSettings({ openAtLogin: item.checked });
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => this.emit('quit') },
    ]);

    this.tray.setContextMenu(contextMenu);

    this.tray.on('double-click', () => this.emit('show-window'));

    console.log('[TrayManager] 系统托盘已创建');
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;