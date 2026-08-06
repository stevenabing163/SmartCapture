# SmartCapture 发布与部署指南

本指南帮助你将代码推送到 GitHub、创建 Release 版本、配置 GitHub Pages。

---

## 第一步：推送代码到 GitHub

当前网络无法连接 GitHub（端口 443 被阻止）。请在网络可用时执行：

```bash
cd E:\Desktop\trae_issues\ToDoList
git push origin main
```

如果仍然连接失败，尝试以下方法：
1. 检查是否需要配置代理：`git config --global http.proxy http://你的代理地址:端口`
2. 使用手机热点或其他网络
3. 在 GitHub Desktop 中打开仓库推送

---

## 第二步：创建 GitHub Release（发布版本）

### 方式一：手动创建（推荐新手）

1. 打开仓库页面：https://github.com/stevenabing163/SmartCapture
2. 点击右侧 **"Releases"** 链接
3. 点击 **"Create a new release"**
4. **Tag version**：输入 `v1.0.0`（从下拉菜单选"Create new tag"）
5. **Release title**：输入 `SmartCapture v1.0.0 - 智能待办捕获工具`
6. **Description**：粘贴以下内容：

```
## 🎉 新版本特性

- 📷 区域截图 → 直接存为待办（无需 AI）
- 🤖 AI 智能识别截图文字内容
- 📋 剪贴板自动捕获
- 📅 日历视图（点击日期查看当天完整待办）
- 🔔 桌面通知提醒
- ⌨️ 全局快捷键支持

## 📦 下载

| 文件 | 说明 |
|------|------|
| SmartCapture-Portable.zip | Windows 便携版（解压即用） |

## 🚀 快速开始

1. 下载 `SmartCapture-Portable.zip`
2. 解压到任意目录
3. 双击 `SmartCapture.exe` 运行

> ⚠️ Windows SmartScreen 提示时，点击「更多信息」→「仍要运行」

## 🔧 系统要求

- Windows 10/11（64位）
- 约 400MB 磁盘空间

## 📝 更新日志

### v1.0.0
- 首个稳定版本发布
- 完整的待办管理功能
- AI 解析 + 规则解析双模式
```

7. **Attach binaries by dropping them here or selecting them**：上传 `dist/SmartCapture-Portable.zip`
8. 点击 **"Publish release"**

### 方式二：使用命令行脚本

如果你的网络可以访问 GitHub，并且已安装 GitHub CLI（`gh`）：

```bash
# 安装 GitHub CLI（如果未安装）
winget install GitHub.cli

# 登录
gh auth login

# 创建 Release
cd E:\Desktop\trae_issues\ToDoList
gh release create v1.0.0 ^
  --title "SmartCapture v1.0.0 - 智能待办捕获工具" ^
  --notes-file release-notes.md ^
  dist/SmartCapture-Portable.zip
```

---

## 第三步：配置 GitHub Pages（在线演示）

代码中已包含 `docs/` 目录作为演示页面，推送后需要在仓库设置中启用：

1. 打开仓库页面：https://github.com/stevenabing163/SmartCapture
2. 点击 **"Settings"**（设置）
3. 左侧菜单点击 **"Pages"**
4. **Source** 选择 **"Deploy from a branch"**
5. **Branch** 选择 `main`，目录选择 `/docs`
6. 点击 **"Save"**

等待 1-2 分钟后，访问：
👉 **https://stevenabing163.github.io/SmartCapture/**

即可看到在线交互演示页面！

---

## 第四步：验证所有链接

推送完成后，验证以下链接：

- [ ] 仓库首页：https://github.com/stevenabing163/SmartCapture
- [ ] Release 页面：https://github.com/stevenabing163/SmartCapture/releases
- [ ] 在线演示：https://stevenabing163.github.io/SmartCapture/
- [ ] Release 徽章：访问仓库首页，确认版本徽章显示正常

---

## 常见问题

**Q: 推送时提示 "Connection was reset"？**
A: 网络问题。检查是否需要翻墙/代理，或换个网络环境重试。

**Q: Release 上传文件太大失败？**
A: GitHub Release 单个文件限制 2GB，SmartCapture-Portable.zip 约 166MB 应该没问题。

**Q: GitHub Pages 显示 404？**
A: 等待 1-3 分钟让 GitHub 部署。如果仍不工作，检查 Settings → Pages 中 Source 是否正确设置为 `main` 分支的 `/docs` 目录。

**Q: 如何下载最新版本？**
A: 用户可以访问 Release 页面下载，README 中的徽章也会自动显示最新版本号。
