# SmartCapture — Smart Todo Capture Tool

> Made by **King with Trae** · [中文版](README.md)

A Windows desktop smart todo capture tool that instantly converts **clipboard text and screenshots** into actionable todo items or calendar events.

<p align="center">
  <a href="https://github.com/stevenabing163/SmartCapture/releases">
    <img src="https://img.shields.io/github/v/release/stevenabing163/SmartCapture?label=Version&style=for-the-badge" alt="Release" />
  </a>
  <a href="https://github.com/stevenabing163/SmartCapture/releases">
    <img src="https://img.shields.io/github/downloads/stevenabing163/SmartCapture/total?label=Downloads&style=for-the-badge" alt="Downloads" />
  </a>
</p>

<p align="center">
  🚀 <a href="https://stevenabing163.github.io/SmartCapture/">Live Demo (GitHub Pages)</a>
</p>

---

## ✨ Key Features

### 1. Multi-Source Capture
- **Auto Clipboard Monitoring**: Automatically detects todo information from any text you copy
- **Region Screenshot**: Select any screen region with two processing modes:
  - 📌 **Save Directly as Todo**: Screenshot saved as attachment (no AI needed)
  - 🤖 **AI Smart Recognition**: AI-powered OCR to extract text content from screenshots
- **Manual Paste**: Paste text at any time for parsing

### 2. Smart Content Parsing
- **Rule Mode (Offline)**: Local regex matching for time, location, and priority
- **AI Mode (Online)**: LLM API integration for deep parsing of natural language task intent
- Recognizes: relative time (tomorrow/next Monday), absolute dates, locations, priorities

### 3. Todo & Calendar Management
- Task cards: title, due date, location, priority tag, screenshot thumbnail
- Calendar view: monthly view of all events, click a date to see full todo list for that day
- Task details: shows original full text and full-size screenshot preview
- Filter: All / Today / Pending / Completed

### 4. Global Shortcuts
| Shortcut | Function |
|----------|----------|
| `Ctrl+Shift+S` | Region Screenshot |
| `Ctrl+Shift+T` | Show/Hide Main Window |
| `Ctrl+Shift+Q` | Quick Capture |

### 5. 📱 Mobile LAN Access
- Automatically starts an HTTP service on launch (default port 3000)
- When **mobile and PC are on the same WiFi**, access directly from mobile browser
- Full features: view/manage todos, calendar view, screenshot thumbnail preview
- Supports "Add to Home Screen" as PWA for offline use
- LAN address displayed in settings page, one-click copy

### 6. System Tray
- Runs in background, keeps your taskbar clean
- Tray shortcut menu: screenshot, show window, quit

---

## 🚀 Quick Start (3 Steps)

### Step 1: Download the Installer

Go to [GitHub Releases](https://github.com/stevenabing163/SmartCapture/releases) and download the latest `SmartCapture-Portable.zip`.

> 💡 Can't access GitHub? Contact the author to get a copy.

### Step 2: Extract & Run

1. Extract `SmartCapture-Portable.zip` to any folder (e.g. `D:\Apps\SmartCapture\`)
2. Double-click `SmartCapture.exe` to launch

> ⚠️ **Windows SmartScreen Warning?**
> On first run, you may see a "Windows protected your PC" message. This is because the app doesn't have a Microsoft signature yet. Click **"More info" → "Run anyway"** to continue.

### Step 3: Start Using

- **Copy text** → auto-parsed as todo
- **Click 📷 Screenshot** → select screen region → choose "Save as Todo" or "AI Recognition"
- **Configure AI** (optional) → Settings → AI Parse Config → Enter API Key

### Step 4 (Optional): Mobile LAN Access

Want to manage your todos on your phone too? Just 3 steps:

1. Make sure **your phone and computer are on the same WiFi**
2. Open SmartCapture → **Settings → Mobile Access**
3. Enter the displayed LAN address in your mobile browser (e.g. `http://192.168.1.100:3000`)

> 💡 After first visit, you can "Add to Home Screen" from your mobile browser menu to use it like an app, with offline support.

That's it — no installation, no environment setup required!

---

## 💻 System Requirements

| Item | Requirement |
|------|-------------|
| OS | Windows 10 / 11 (64-bit) |
| RAM | Minimum 2GB |
| Disk Space | ~400 MB (after extraction) |
| Network | Optional (AI features require internet) |

---

## 🛠️ For Developers: Run from Source

> For developers who want to modify or debug the app. Regular users should use the portable version above.

### Environment Requirements

- **Node.js** >= 18.0.0 (20 LTS recommended)
- **npm** >= 9.0.0
- **OS**: Windows 10/11

### Install & Run

```bash
# 1. Clone the repository
git clone https://github.com/stevenabing163/SmartCapture.git
cd SmartCapture

# 2. Install dependencies
npm install

# 3. Start development mode
npm start

# 4. Build portable version (output to dist/ directory)
npm run build:portable
```

### Build Output

```
dist/
├── SmartCapture-Portable/      # Portable extraction directory
│   ├── SmartCapture.exe        # Main executable
│   ├── 启动SmartCapture.bat    # Launch script
│   └── README.txt              # Quick start guide
└── SmartCapture-Portable.zip   # Distribution archive
```

---

## 📖 User Guide

### Configure AI (Optional)

Enter your API key in **Settings → AI Parse Config** and click "🔌 Test Connection" to verify:

- **API Endpoint**: Supports any OpenAI-compatible API
- **API Key**: Get from your provider's platform
- **Model Name**: Select based on your API provider

> 💡 **You can use it without AI!** The built-in rule parser can recognize common time patterns offline. Screenshots can be saved directly as todos.

### Start Capturing

1. **Auto Clipboard Capture**: Just copy any text, the app will automatically detect and parse it
2. **Screenshot Capture**: Click "📷 Screenshot" → select region → choose processing mode
3. **Manual Paste**: Click the "Paste" button in the toolbar to manually submit text

### Manage Tasks

- **Todo List**: View, edit, complete, and delete tasks; screenshot tasks show thumbnails
- **Calendar View**: Click a date to see all todos for that day (including screenshot previews)
- **Task Details**: Click a task card to open the detail modal, view full-size screenshots

### 📱 Mobile LAN Access

SmartCapture has a built-in HTTP server that allows mobile phones to access full functionality through a browser:

1. **Start Service**: Automatically starts in the background when the app launches (default port 3000)
2. **Get Address**: Open **Settings → Mobile Access** to see the LAN address
3. **Mobile Access**: Enter the address in your mobile browser, e.g. `http://192.168.1.100:3000`
4. **Add to Home Screen**: Mobile browser menu → "Add to Home Screen" → use it like an app

> ⚠️ **Security Notice**: Other devices on your LAN can also access your data. Do not use this feature on public WiFi.

> 🔧 **Port Occupied?** The app will automatically try the next port (3001, 3002...). Use the actual address shown in the settings page.

> 🔥 **Firewall Blocked?** If your phone can't access, allow inbound connections for SmartCapture in the Windows Firewall.

---

## 📁 Project Structure

```
SmartCapture/
├── package.json              # Project configuration
├── main.js                   # Electron main process entry
├── preload.js                # Preload script (IPC bridge)
├── build-portable.js         # Portable build script
├── start.bat                 # Windows quick launch
├── README.md                 # This file
├── src/
│   ├── core/                 # Core business modules
│   │   ├── clipboard.js      # Clipboard listener
│   │   ├── screenshot.js     # Screenshot capture
│   │   ├── hotkey.js         # Global shortcuts
│   │   ├── tray.js           # System tray
│   │   ├── parser.js         # Content parser
│   │   ├── store.js          # Data storage
│   │   └── web-server.js     # Web server
│   └── ui/                   # Frontend interface
│       ├── index.html        # Main page
│       ├── styles.css        # Styles
│       ├── renderer.js       # Renderer logic
│       ├── manifest.json     # PWA manifest
│       ├── service-worker.js # Service Worker
│       ├── region-selector.html # Region screenshot selector
│       ├── region-preload.js # Region screenshot preload
│       └── icons/            # App icons
└── data/                     # Runtime data (database, logs)
```

---

## ❓ FAQ

<details>
<summary><strong>Q: How do I completely quit the program?</strong></summary>

Right-click the system tray icon → click "Quit". Closing the main window does not exit the program.
</details>

<details>
<summary><strong>Q: Clipboard monitoring not working?</strong></summary>

Make sure clipboard monitoring is enabled in "Capture Center" or "Settings". You need to copy at least 2 characters of text.
</details>

<details>
<summary><strong>Q: Where are the saved screenshots?</strong></summary>

Screenshots are embedded directly in todo items. Open the task detail modal to view the full image.
</details>

<details>
<summary><strong>Q: AI recognition failed / Insufficient balance?</strong></summary>

Go to "Settings → AI Parse Config" and verify your API key and account balance. You can also choose "Save directly as Todo" to skip AI.
</details>

<details>
<summary><strong>Q: Where is my data stored?</strong></summary>

Portable version: `data/smartcapture.db` in the same directory as the EXE
Development version: `data/smartcapture.db` in the project root
</details>

<details>
<summary><strong>Q: How do I migrate to another computer?</strong></summary>

**Option 1 (Recommended)**: Copy the entire `SmartCapture-Portable` folder to the new computer. Double-click to run — your data comes along automatically.

**Option 2**: On the old computer: "Settings → Export Data" → On the new computer: "Settings → Import Data".
</details>

<details>
<summary><strong>Q: How do I access my todos from my phone?</strong></summary>

1. Make sure your phone and computer are on the same WiFi
2. Open SmartCapture → Settings → Mobile Access
3. Enter the displayed address in your mobile browser (e.g. `http://192.168.1.100:3000`)
4. Want easier access? Mobile browser menu → "Add to Home Screen"

If the phone can't connect: Check if Windows Firewall is blocking inbound connections for SmartCapture.
</details>

<details>
<summary><strong>Q: Mobile access shows connection failed?</strong></summary>

- Confirm phone and computer are on the same WiFi network (not one wired and one wireless)
- Check computer firewall: Control Panel → Windows Firewall → Allow app through firewall → Check SmartCapture
- Confirm SmartCapture is running (can be minimized to tray)
- When port 3000 is occupied, the app will auto-switch to 3001 etc. — use the address shown in settings
</details>

---

## 📄 License

MIT License © King with Trae
