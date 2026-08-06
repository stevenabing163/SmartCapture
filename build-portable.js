/**
 * SmartCapture 便携版打包脚本
 * 直接使用本地已安装的 Electron，无需联网下载
 * 输出到 dist/SmartCapture-Portable/ 目录
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist', 'SmartCapture-Portable');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');

const KEEP_LOCALES = new Set([
  'en-US.pak', 'en-GB.pak', 'zh-CN.pak', 'zh-TW.pak',
]);

// 根目录级跳过（项目根目录，不复制到便携版）
const ROOT_ONLY_SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'data',
  'build-portable.js',
  'package.json',
  'package-lock.json',
  'run.js',
  'start.bat',
  'README.md',
  '使用说明.md',
  '便携版使用说明.md',
]);

// 应用级文件（从项目根复制）
const APP_FILES = [
  'main.js',
  'preload.js',
  'src',
];

// sql.js 需要的最小文件集
const SQLJS_ESSENTIAL = [
  'dist/sql-wasm.js',
  'dist/sql-wasm.wasm',
  'dist/worker.sql-wasm.js',
  'package.json',
  'README.md',
  'LICENSE',
];

const SKIP_DIRS = new Set(['.git', 'data', '.cache', 'node_modules']);

function copyDir(src, dest, depth = 0, isRoot = false) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (isRoot && ROOT_ONLY_SKIP.has(entry.name)) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    // 跳过已知的不必要文件
    if (!entry.isDirectory() && UNNECESSARY_FILES.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Electron locales: only keep needed languages
    if (entry.isDirectory() && entry.name === 'locales') {
      fs.mkdirSync(destPath, { recursive: true });
      for (const lf of fs.readdirSync(srcPath)) {
        if (KEEP_LOCALES.has(lf)) {
          fs.copyFileSync(path.join(srcPath, lf), path.join(destPath, lf));
        }
      }
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, depth + 1, false);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 仅移除明确非关键的文件，保留所有 DLL 和 V8 二进制
const UNNECESSARY_FILES = new Set([
  'LICENSES.chromium.html',
  'chrome_200_percent.pak',
  'chrome_100_percent.pak',
  'default_app.asar',
]);

function forceDelete(filePath, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (e) {
      if (i < maxRetries - 1) {
        // 等待一小段时间再重试
        const start = Date.now();
        while (Date.now() - start < 200) { /* busy wait */ }
      }
    }
  }
  return false;
}

function copyElectron() {
  console.log('📦 复制 Electron 运行时...');
  copyDir(ELECTRON_DIST, DIST);

  // 等待文件系统操作完成
  const start = Date.now();
  while (Date.now() - start < 300) { /* brief wait */ }

  // 移除不必要的文件（根目录 + resources 目录）
  const resourcesDir = path.join(DIST, 'resources');

  // 收集所有需要删除的文件（包括子目录中的）
  const toDelete = [];

  // 根目录
  if (fs.existsSync(DIST)) {
    for (const f of fs.readdirSync(DIST)) {
      if (UNNECESSARY_FILES.has(f)) {
        toDelete.push(path.join(DIST, f));
      }
    }
  }

  // resources 目录
  if (fs.existsSync(resourcesDir)) {
    for (const f of fs.readdirSync(resourcesDir)) {
      if (UNNECESSARY_FILES.has(f)) {
        toDelete.push(path.join(resourcesDir, f));
      }
    }
  }

  // 执行删除
  for (const fp of toDelete) {
    forceDelete(fp, 5);
  }

  // 过滤 Electron 根目录下多余的 locales 文件
  if (fs.existsSync(DIST)) {
    for (const f of fs.readdirSync(DIST)) {
      if (f.endsWith('.pak') && !KEEP_LOCALES.has(f) && f !== 'resources.pak') {
        forceDelete(path.join(DIST, f));
      }
    }
  }

  // 清理 locales 目录中不需要的语言包
  const localesDir = path.join(DIST, 'locales');
  if (fs.existsSync(localesDir)) {
    for (const f of fs.readdirSync(localesDir)) {
      if (!KEEP_LOCALES.has(f)) {
        forceDelete(path.join(localesDir, f));
      }
    }
  }

  console.log('  ✅ 已精简 Electron 运行时');
}

function copyApp() {
  console.log('📋 复制应用文件...');
  const appDir = path.join(DIST, 'resources', 'app');
  fs.mkdirSync(appDir, { recursive: true });

  for (const file of APP_FILES) {
    const src = path.join(ROOT, file);
    const dest = path.join(appDir, file);
    if (fs.existsSync(src)) {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        copyDir(src, dest);
      } else {
        fs.copyFileSync(src, dest);
      }
    }
  }

  // 复制 sql.js（精简版，只保留必要文件）
  const sqljsSrc = path.join(ROOT, 'node_modules', 'sql.js');
  const sqljsDest = path.join(appDir, 'node_modules', 'sql.js');
  if (fs.existsSync(sqljsSrc)) {
    console.log('📦 复制 sql.js 依赖（精简版）...');
    fs.mkdirSync(sqljsDest, { recursive: true });
    for (const f of SQLJS_ESSENTIAL) {
      const src = path.join(sqljsSrc, f);
      if (fs.existsSync(src)) {
        const dest = path.join(sqljsDest, f);
        if (fs.statSync(src).isDirectory()) {
          copyDir(src, dest);
        } else {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
        }
      }
    }
    console.log('  ✅ sql.js 已复制');
  }

  // 复制便携版使用说明到根目录和 app 目录
  const docSrc = path.join(ROOT, '便携版使用说明.md');
  if (fs.existsSync(docSrc)) {
    fs.copyFileSync(docSrc, path.join(DIST, '便携版使用说明.md'));
    fs.copyFileSync(docSrc, path.join(appDir, '便携版使用说明.md'));
  }

  // 写入精简的 package.json
  const pkg = {
    name: 'smart-capture',
    version: '1.0.0',
    main: 'main.js',
  };
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(pkg, null, 2)
  );
}

function renameExe() {
  const electronExe = path.join(DIST, 'electron.exe');
  const smartExe = path.join(DIST, 'SmartCapture.exe');
  if (fs.existsSync(electronExe)) {
    fs.copyFileSync(electronExe, smartExe);
  }
}

function createLauncher() {
  fs.writeFileSync(
    path.join(DIST, '启动SmartCapture.bat'),
    '@echo off\r\nSmartCapture.exe\r\n',
    'utf-8'
  );
}

function createReadme() {
  const readmeContent = `SmartCapture 便携版 v1.0
================================
由 King with Trae 制作

## 快速开始
1. 双击 SmartCapture.exe 启动
2. 首次启动会在同目录创建 data/ 文件夹存储数据

## 核心功能
- ✅ 待办任务管理（多优先级、多提醒、完成标记）
- ✅ 剪贴板自动捕获（复制文本自动解析为待办）
- ✅ 区域截图 → 直接存为待办 / AI 智能识别
- ✅ 日历视图（点击日期查看当天所有待办）
- ✅ 任务到期提醒（系统桌面通知）
- ✅ 数据导入导出（JSON 备份/恢复）

## 截图功能说明
- 点击 📷 截图 按钮 → 框选区域 → 松开鼠标
- 弹出对话框选择：
  - 🤖 AI 智能识别：调用 AI 接口识别图片中的文字（需配置 API Key）
  - 📌 直接存为待办：不识别，截图作为附件保存到待办事项

## 快捷键
  Ctrl+Shift+A  全屏截图
  Ctrl+Shift+S  区域截图
  Ctrl+Shift+T  显示/隐藏主窗口
  Ctrl+Shift+Q  快速捕获

## 数据位置
所有数据存储在 exe 同级的 data/ 目录中
移动整个文件夹即可迁移数据

## 常见问题
- Windows 保护提示：点「更多信息」→「仍要运行」
- AI 识别失败：请到「设置 → AI 解析配置」检查 API Key 和余额
- 退出程序：右键系统托盘图标 → 退出

## 详细说明
请查看「便携版使用说明.md」
`;
  fs.writeFileSync(path.join(DIST, 'README.txt'), readmeContent, 'utf-8');
}

function createZip() {
  console.log('🗜️  压缩为 ZIP...');
  const zipFile = path.join(ROOT, 'dist', 'SmartCapture-Portable.zip');
  if (fs.existsSync(zipFile)) {
    try { fs.unlinkSync(zipFile); } catch (_) {}
  }

  // 尝试多种压缩方法（按优先级排序）
  const sevenZipPaths = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  const sevenZip = sevenZipPaths.find(p => fs.existsSync(p));

  let compressed = false;

  // 方法 1: 7-Zip
  if (sevenZip) {
    try {
      execSync(`"${sevenZip}" a -tzip "${zipFile}" "${DIST}" -mx=5`, {
        stdio: 'inherit', maxBuffer: 50 * 1024 * 1024, timeout: 300000,
      });
      compressed = true;
    } catch (_) {}
  }

  // 方法 2: tar (Windows 10+ 内置，对锁定文件更宽容)
  if (!compressed) {
    try {
      execSync(
        `tar -a -c -f "${zipFile}" -C "${path.dirname(DIST)}" "${path.basename(DIST)}"`,
        { stdio: 'inherit', timeout: 300000, maxBuffer: 50 * 1024 * 1024 }
      );
      compressed = true;
    } catch (_) {}
  }

  // 方法 3: PowerShell Compress-Archive
  if (!compressed) {
    try {
      execSync(
        `powershell -Command "Compress-Archive -Path '${DIST}' -DestinationPath '${zipFile}' -CompressionLevel Optimal -Force"`,
        { stdio: 'inherit', timeout: 300000, maxBuffer: 50 * 1024 * 1024 }
      );
      compressed = true;
    } catch (_) {}
  }

  if (compressed && fs.existsSync(zipFile)) {
    const zipSize = (fs.statSync(zipFile).size / (1024 * 1024)).toFixed(1);
    console.log(`  📦 ZIP 大小: ${zipSize} MB`);
  } else {
    console.log('  ⚠️ 自动压缩失败，请手动压缩 dist/SmartCapture-Portable 文件夹');
    console.log('     文件夹已就绪，可直接复制整个目录到其他电脑使用');
  }
}

function verifyBuild() {
  console.log('\n🔍 验证打包结果...');
  const checks = [
    { path: 'SmartCapture.exe', desc: '主程序' },
    { path: '启动SmartCapture.bat', desc: '启动脚本' },
    { path: 'README.txt', desc: '快速入门' },
    { path: 'resources/app/main.js', desc: '主进程代码' },
    { path: 'resources/app/preload.js', desc: '预加载脚本' },
    { path: 'resources/app/src/ui/index.html', desc: '前端页面' },
    { path: 'resources/app/src/ui/styles.css', desc: '样式表' },
    { path: 'resources/app/src/ui/renderer.js', desc: '渲染逻辑' },
    { path: 'resources/app/src/ui/manifest.json', desc: 'PWA manifest' },
    { path: 'resources/app/src/ui/service-worker.js', desc: 'Service Worker' },
    { path: 'resources/app/src/ui/icons/icon-192.png', desc: 'PWA 图标 192' },
    { path: 'resources/app/src/ui/icons/icon-512.png', desc: 'PWA 图标 512' },
    { path: 'resources/app/src/core/web-server.js', desc: 'Web 服务模块' },
    { path: 'resources/app/src/core/store.js', desc: '数据存储' },
    { path: 'resources/app/src/core/parser.js', desc: '内容解析器' },
    { path: 'resources/app/src/core/screenshot.js', desc: '截图模块' },
    { path: 'resources/app/src/core/clipboard.js', desc: '剪贴板模块' },
    { path: 'resources/app/node_modules/sql.js/dist/sql-wasm.js', desc: 'sql.js' },
    { path: 'resources/app/node_modules/sql.js/dist/sql-wasm.wasm', desc: 'sql.js WASM' },
    { path: 'locales/zh-CN.pak', desc: '中文语言包' },
    { path: '便携版使用说明.md', desc: '详细使用说明' },
  ];

  let passed = 0;
  for (const check of checks) {
    const fullPath = path.join(DIST, check.path);
    if (fs.existsSync(fullPath)) {
      console.log(`  ✅ ${check.desc}`);
      passed++;
    } else {
      console.log(`  ❌ ${check.desc} — 缺失!`);
    }
  }

  // 验证排除的文件确实不存在
  const excluded = ['LICENSES.chromium.html', 'default_app.asar'];
  for (const f of excluded) {
    if (fs.existsSync(path.join(DIST, f))) {
      console.log(`  ⚠️  未精简: ${f} 仍然存在`);
    }
  }

  // 验证关键 DLL 存在
  const criticalDlls = ['vk_swiftshader.dll', 'vulkan-1.dll', 'snapshot_blob.bin', 'v8_context_snapshot.bin'];
  for (const dll of criticalDlls) {
    if (!fs.existsSync(path.join(DIST, dll))) {
      console.log(`  ❌ 关键文件缺失: ${dll}`);
    }
  }

  console.log(`\n  验证通过: ${passed}/${checks.length}`);
  return passed === checks.length;
}

function main() {
  console.log('========================================');
  console.log('  SmartCapture 便携版打包工具 v2.0');
  console.log('========================================\n');

  // 清理旧输出（处理文件锁定）
  const oldDir = path.join(ROOT, 'dist', 'SmartCapture-Portable');
  const tempDir = path.join(ROOT, 'dist', '_old_' + Date.now());
  if (fs.existsSync(oldDir)) {
    try {
      fs.rmSync(oldDir, { recursive: true, force: true });
    } catch (e) {
      try {
        fs.renameSync(oldDir, tempDir);
        // 异步清理
        setTimeout(() => {
          try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        }, 5000);
      } catch (e2) {
        console.log('⚠️  旧目录被占用，将尝试覆盖写入');
      }
    }
  }

  try {
    copyElectron();
    copyApp();
    renameExe();
    createLauncher();
    createReadme();

    // 计算大小
    const totalSize = getTotalSize(DIST);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);

    console.log('\n========================================');
    console.log(`  ✅ 便携版构建完成！`);
    console.log(`  📁 输出目录: ${DIST}`);
    console.log(`  💾 文件夹大小: ${sizeMB} MB`);
    console.log(`  🚀 运行: 双击 SmartCapture.exe`);
    console.log('========================================\n');

    // 验证
    const ok = verifyBuild();
    if (!ok) {
      console.log('⚠️  部分文件缺失，请检查上方日志');
    }

    createZip();

    console.log('\n📤 迁移到其他电脑：');
    console.log('   1. 将 SmartCapture-Portable.zip 复制到 U 盘/网盘');
    console.log('   2. 在目标电脑上解压');
    console.log('   3. 双击 SmartCapture.exe 即可运行');
    console.log('   4. 手机访问：设置 → 手机查看局域网地址\n');

  } catch (err) {
    console.error('❌ 打包失败:', err.message);
    process.exit(1);
  }
}

function getTotalSize(dir) {
  let size = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getTotalSize(fullPath);
    } else {
      size += fs.statSync(fullPath).size;
    }
  }
  return size;
}

main();