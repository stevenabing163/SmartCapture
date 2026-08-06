const EventEmitter = require('events');

class ScreenshotCapture extends EventEmitter {
  constructor(desktopCapturer, screen) {
    super();
    this.desktopCapturer = desktopCapturer;
    this.screen = screen;
    this.regionWindow = null;
  }

  async captureFullScreen() {
    try {
      const { screen: screenMod } = require('electron');
      const display = screenMod.getPrimaryDisplay();
      const sources = await this.desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: display.bounds.width,
          height: display.bounds.height,
        },
      });

      if (sources && sources[0]) {
        const dataUrl = sources[0].thumbnail.toDataURL();
        this.emit('screenshot', dataUrl);
        return { success: true, dataUrl, source: 'fullscreen' };
      }
      return { success: false, error: '无法获取屏幕源' };
    } catch (err) {
      console.error('[ScreenshotCapture] 全屏截图失败:', err.message);
      return { success: false, error: err.message };
    }
  }

  captureRegion() {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      try {
        const { BrowserWindow, ipcMain, screen: screenMod } = require('electron');
        const display = screenMod.getPrimaryDisplay();
        const { width, height } = display.bounds;

        this.regionWindow = new BrowserWindow({
          x: 0,
          y: 0,
          width: width,
          height: height,
          frame: false,
          transparent: true,
          resizable: false,
          movable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          hasShadow: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: require('path').join(__dirname, '..', 'ui', 'region-preload.js'),
          },
        });

        this.regionWindow.setIgnoreMouseEvents(false);
        this.regionWindow.loadFile(require('path').join(__dirname, '..', 'ui', 'region-selector.html'));

        ipcMain.once('region:selected', async (_e, bounds) => {
          if (this.regionWindow) {
            this.regionWindow.close();
            this.regionWindow = null;
          }

          if (bounds && bounds.width > 5 && bounds.height > 5) {
            try {
              const sources = await this.desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                  width: width,
                  height: height,
                },
              });

              if (sources && sources[0]) {
                const cropped = this._cropImage(
                  sources[0].thumbnail,
                  bounds.x,
                  bounds.y,
                  bounds.width,
                  bounds.height
                );
                this.emit('screenshot', cropped);
                safeResolve({ success: true, dataUrl: cropped, source: 'region' });
              } else {
                safeResolve({ success: false, error: '无法获取屏幕源' });
              }
            } catch (err) {
              safeResolve({ success: false, error: err.message });
            }
          } else {
            safeResolve({ success: false, error: '未选择有效区域' });
          }
        });

        ipcMain.once('region:cancelled', () => {
          if (this.regionWindow) {
            this.regionWindow.close();
            this.regionWindow = null;
          }
          safeResolve({ success: false, error: '已取消' });
        });

        this.regionWindow.on('closed', () => {
          this.regionWindow = null;
          // If window closes without selection (e.g., system restart), resolve with error
          safeResolve({ success: false, error: '截图窗口已关闭' });
        });
      } catch (err) {
        console.error('[ScreenshotCapture] 区域截图失败:', err.message);
        safeResolve({ success: false, error: err.message });
      }
    });
  }

  _cropImage(thumbnail, x, y, w, h) {
    const cropped = thumbnail.crop({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
    return cropped.toDataURL();
  }
}

module.exports = ScreenshotCapture;