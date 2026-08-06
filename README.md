# SmartCapture — 智能待办捕获工具

> 由 **King with Trae** 制作 · [English Version](README.en.md)

一款 Windows 桌面端智能待办捕获工具，能将**剪贴板文本、截图内容**快速转化为待办事项或日历事件。

<p align="center">
  <a href="https://github.com/stevenabing163/SmartCapture/releases">
    <img src="https://img.shields.io/github/v/release/stevenabing163/SmartCapture?label=Version&style=for-the-badge" alt="Release" />
  </a>
  <a href="https://github.com/stevenabing163/SmartCapture/releases">
    <img src="https://img.shields.io/github/downloads/stevenabing163/SmartCapture/total?label=Downloads&style=for-the-badge" alt="Downloads" />
  </a>
</p>

<p align="center">
  🚀 <a href="https://stevenabing163.github.io/SmartCapture/">在线演示（GitHub Pages）</a>
</p>

---

## ✨ 核心功能

### 1. 多源内容捕获
- **剪贴板自动监听**：复制任何文本后自动识别待办信息
- **区域截图**：框选屏幕区域，两种处理方式：
  - 📌 **直接存为待办**：截图作为附件保存到待办事项（无需 AI）
  - 🤖 **AI 智能识别**：调用 AI OCR 识别截图中的文字内容
- **手动粘贴**：随时粘贴文本进行解析

### 2. 智能内容解析
- **规则模式（离线）**：本地正则匹配，识别时间、地点、优先级
- **AI 模式（在线）**：调用 LLM API 深度解析，理解自然语言中的任务意图
- 支持识别：相对时间（明天/下周一）、绝对日期、地点、优先级

### 3. 待办 & 日历管理
- 任务卡片：标题、截止日期、地点、优先级标签、截图缩略图
- 日历视图：月视图展示所有事件，点击日期查看当天完整待办内容
- 任务详情：显示原始全文和截图大图预览
- 筛选：全部 / 今天 / 进行中 / 已完成

### 4. 全局快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+S` | 区域截图 |
| `Ctrl+Shift+T` | 显示/隐藏主窗口 |
| `Ctrl+Shift+Q` | 快速捕获 |

### 5. 📱 手机局域网访问
- 启动后自动开启 HTTP 服务（默认端口 3000）
- **手机和电脑在同一 WiFi** 时，手机浏览器直接访问即可使用
- 完整功能：查看/管理待办、日历视图、截图缩略图预览
- 支持「添加到主屏幕」作为 PWA 离线使用
- 设置页显示局域网访问地址，一键复制

### 6. 系统托盘
- 后台运行，不占用任务栏
- 托盘快捷菜单：截图、显示窗口、退出

---

## 🚀 快速开始（3 步上手）

### 第一步：下载安装包

前往 [GitHub Releases](https://github.com/stevenabing163/SmartCapture/releases) 下载最新版本的 `SmartCapture-Portable.zip`。

> 💡 不方便访问 GitHub？可以联系作者获取。

### 第二步：解压运行

1. 将 `SmartCapture-Portable.zip` 解压到任意文件夹（如 `D:\Apps\SmartCapture\`）
2. 双击 `SmartCapture.exe` 启动

> ⚠️ **Windows SmartScreen 提示？**
> 首次运行可能弹出「Windows 保护了你的电脑」提示。这是因为应用尚未获得 Microsoft 签名。请点击 **「更多信息」→「仍要运行」** 即可。

### 第三步：开始使用

- **复制文本** → 自动解析为待办
- **点击 📷 截图按钮** → 框选屏幕区域 → 选择「直接存为待办」或「AI 识别」
- **配置 AI**（可选）→ 设置 → AI 解析配置 → 填入 API Key

### 第四步（可选）：手机局域网访问

想在手机上也能管理待办？只需 3 步：

1. 确保 **手机和电脑连接在同一个 WiFi**
2. 在 SmartCapture 中打开 **设置 → 手机访问**
3. 手机浏览器打开显示的局域网地址（如 `http://192.168.1.100:3000`）

> 💡 首次打开后可在手机浏览器菜单中选择「添加到主屏幕」，像 App 一样使用，支持离线访问。

就这么简单，无需安装，无需配置环境！

---

## 💻 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 / 11（64 位） |
| 内存 | 最低 2GB RAM |
| 磁盘空间 | 约 400 MB（解压后） |
| 网络 | 可选（AI 功能需要联网） |

---

## 🛠️ 开发者：从源码运行

> 适合开发者二次开发或调试。普通用户请直接使用上方的便携版。

### 环境要求

- **Node.js** >= 18.0.0（推荐 20 LTS）
- **npm** >= 9.0.0
- **操作系统**：Windows 10/11

### 安装与运行

```bash
# 1. 克隆仓库
git clone https://github.com/stevenabing163/SmartCapture.git
cd SmartCapture

# 2. 安装依赖
npm install

# 3. 启动开发模式
npm start

# 4. 打包便携版（输出到 dist/ 目录）
npm run build:portable
```

### 打包产物位置

```
dist/
├── SmartCapture-Portable/      # 便携版解压目录
│   ├── SmartCapture.exe        # 主程序
│   ├── 启动SmartCapture.bat    # 启动脚本
│   └── README.txt              # 快速入门
└── SmartCapture-Portable.zip   # 压缩包（用于分发）
```

---

## 📖 使用指南

### 配置 AI（可选）

在 **设置 → AI 解析配置** 中填入你的 API 密钥，点击「🔌 测试连接」验证：

- **API 端点**：支持任何兼容 OpenAI 的 API
- **API 密钥**：从对应平台获取
- **模型名称**：根据 API 平台选择

> 💡 **不配置 AI 也能用！** 内置规则解析器可离线识别常见时间模式。截图可直接存为待办。

### 开始捕获

1. **剪贴板自动捕获**：直接复制任何文本，应用会自动检测并解析
2. **截图捕获**：点击「📷 截图」按钮 → 框选区域 → 选择处理方式
3. **手动粘贴**：点击工具栏「粘贴」按钮手动提交文本

### 管理任务

- **待办列表**：查看、编辑、完成、删除任务；截图任务显示缩略图
- **日历视图**：点击日期查看当天所有待办完整内容（含截图预览）
- **任务详情**：点击任务卡片打开详情弹窗，可查看截图大图

### 📱 手机局域网访问

SmartCapture 内置 HTTP 服务，允许手机通过浏览器访问完整功能：

1. **启动服务**：应用启动后自动在后台开启（默认端口 3000）
2. **获取地址**：打开 **设置 → 手机访问**，页面显示局域网地址
3. **手机访问**：手机浏览器输入地址即可使用，例如 `http://192.168.1.100:3000`
4. **添加主屏幕**：手机浏览器菜单 → 「添加到主屏幕」→ 即可像 App 一样使用

> ⚠️ **安全提示**：局域网内其他设备也能访问你的数据。请勿在公共 WiFi 下使用此功能。

> 🔧 **端口被占用？** 应用会自动尝试下一个端口（3001、3002...），以设置页显示的实际地址为准。

> 🔥 **防火墙阻止？** 如果手机无法访问，请在 Windows 防火墙中允许 SmartCapture 的入站连接。

---

## 📁 项目结构

```
SmartCapture/
├── package.json              # 项目配置
├── main.js                   # Electron 主进程入口
├── preload.js                # 预加载脚本（IPC 桥接）
├── build-portable.js         # 便携版打包脚本
├── start.bat                 # Windows 快速启动
├── 使用说明.md                # 完整使用说明
├── 便携版使用说明.md           # 便携版说明
├── src/
│   ├── core/                 # 核心业务模块
│   │   ├── clipboard.js      # 剪贴板监听
│   │   ├── screenshot.js     # 截图捕获
│   │   ├── hotkey.js         # 全局快捷键
│   │   ├── tray.js           # 系统托盘
│   │   ├── parser.js         # 内容解析器
│   │   ├── store.js          # 数据存储
│   │   └── web-server.js     # Web 服务
│   └── ui/                   # 前端界面
│       ├── index.html        # 主页面
│       ├── styles.css        # 样式
│       ├── renderer.js       # 渲染逻辑
│       ├── manifest.json     # PWA manifest
│       ├── service-worker.js # Service Worker
│       ├── region-selector.html # 区域截图选择器
│       ├── region-preload.js # 区域截图预加载
│       └── icons/            # 应用图标
└── data/                     # 运行时数据（数据库、日志）
```

---

## ❓ 常见问题

<details>
<summary><strong>Q: 如何彻底退出程序？</strong></summary>

右键系统托盘图标 → 点击「退出」。关闭主窗口不会退出程序。
</details>

<details>
<summary><strong>Q: 剪贴板监控没有反应？</strong></summary>

请确认已在「捕获中心」或「设置」中开启剪贴板监控。复制内容需 ≥2 个字符。
</details>

<details>
<summary><strong>Q: 截图保存的图片在哪里？</strong></summary>

截图直接嵌入待办事项中，打开任务详情弹窗即可查看完整图片。
</details>

<details>
<summary><strong>Q: AI 识别失败 / 报余额不足？</strong></summary>

请到「设置 → AI 解析配置」检查 API Key 是否正确、账户是否有余额。也可以选择「直接存为待办」不使用 AI。
</details>

<details>
<summary><strong>Q: 数据存在哪里？</strong></summary>

便携版：EXE 同级 `data/smartcapture.db`
开发版：项目根目录 `data/smartcapture.db`
</details>

<details>
<summary><strong>Q: 如何迁移到另一台电脑？</strong></summary>

**方式一（推荐）**：复制整个 `SmartCapture-Portable` 文件夹到新电脑，双击即可运行，数据自动跟随。

**方式二**：旧电脑「设置 → 导出数据」→ 新电脑「设置 → 导入数据」。
</details>

<details>
<summary><strong>Q: 手机如何访问电脑上的待办？</strong></summary>

1. 确保手机和电脑在同一 WiFi 下
2. 打开 SmartCapture → 设置 → 手机访问
3. 手机浏览器打开显示的地址（如 `http://192.168.1.100:3000`）
4. 想方便些？手机浏览器菜单 → 「添加到主屏幕」

如果手机打不开：检查 Windows 防火墙是否阻止了 SmartCapture 的入站连接。
</details>

<details>
<summary><strong>Q: 手机访问时提示连接失败？</strong></summary>

- 确认手机和电脑在同一个 WiFi 网络（不是一个连有线一个连 WiFi）
- 检查电脑防火墙：控制面板 → Windows 防火墙 → 允许应用通过防火墙 → 勾选 SmartCapture
- 确认 SmartCapture 正在运行（可以最小化到托盘）
- 端口 3000 被占用时，应用会自动切换到 3001 等端口，以设置页显示的为准
</details>

---

## 📄 许可证

MIT License © King with Trae
