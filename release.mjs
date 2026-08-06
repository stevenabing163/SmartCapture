/**
 * SmartCapture 自动发布脚本
 * 用法: node release.mjs [--version x.y.z] [--notes "发布说明"]
 * 
 * 功能:
 * 1. 更新 package.json 版本号
 * 2. 构建便携版
 * 3. 自动生成 changelog
 * 4. 创建 git tag 并推送到 GitHub（触发 Actions 自动发布）
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      opts.version = args[++i];
    } else if (args[i] === '--notes' && args[i + 1]) {
      opts.notes = args[++i];
    } else if (args[i] === '--skip-build') {
      opts.skipBuild = true;
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    }
  }
  return opts;
}

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return current;
  }
}

function updatePackageVersion(newVersion) {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✅ package.json 版本更新为 ${newVersion}`);
}

function generateChangelog(version, notes) {
  const changelog = `## 🎉 SmartCapture v${version}

${notes || '## 🐛 Bug Fixes & Improvements\n\n- Various improvements and fixes'}

## 📦 Download

| File | Description |
|------|-------------|
| SmartCapture-Portable.zip | Windows Portable (extract & run) |

## 🚀 Quick Start

1. Download \`SmartCapture-Portable.zip\`
2. Extract to any directory
3. Double-click \`SmartCapture.exe\`

> ⚠️ Windows SmartScreen: Click **"More info" → "Run anyway"**

## 🔧 System Requirements

- Windows 10/11 (64-bit)
- ~400 MB disk space
- Optional: Internet for AI features

---

*Released by King with Trae*
`;
  const releaseNotesPath = path.join(ROOT, 'release-notes.md');
  fs.writeFileSync(releaseNotesPath, changelog, 'utf-8');
  console.log(`  ✅ release-notes.md 已更新`);
}

function build() {
  console.log('🔨 构建便携版...');
  execSync('node build-portable.js', { cwd: ROOT, stdio: 'inherit', timeout: 300000 });
  console.log('  ✅ 构建完成');
}

function gitCommitAndTag(version, dryRun) {
  const tag = `v${version}`;
  console.log(`🏷️  创建标签 ${tag}...`);
  
  if (dryRun) {
    console.log('  ⏭️  Dry run 模式，跳过 git 操作');
    return;
  }

  try {
    execSync('git add -A', { cwd: ROOT, stdio: 'pipe' });
    execSync(`git commit -m "release: v${version}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync(`git tag -a ${tag} -m "SmartCapture v${version}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync(`git push origin main`, { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
    execSync(`git push origin ${tag}`, { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
    console.log(`  ✅ 标签 ${tag} 已推送到 GitHub`);
    console.log(`  ✅ GitHub Actions 将自动构建并创建 Release`);
  } catch (e) {
    console.error('  ❌ Git 操作失败:', e.message);
    console.error('  请手动执行:');
    console.error(`    git add -A`);
    console.error(`    git commit -m "release: v${version}"`);
    console.error(`    git tag -a ${tag} -m "SmartCapture v${version}"`);
    console.error(`    git push origin main --tags`);
    process.exit(1);
  }
}

function showBanner() {
  console.log(`
╔══════════════════════════════════════════════════╗
║       SmartCapture Release Manager              ║
║              by King with Trae                  ║
╠══════════════════════════════════════════════════╣
║  用法: node release.mjs [options]               ║
║                                                  ║
║  --version x.y.z   指定版本号                    ║
║  --notes "说明"     自定义发布说明                ║
║  --skip-build       跳过构建步骤                 ║
║  --dry-run          仅预览，不执行 git 操作       ║
║                                                  ║
║  示例:                                          ║
║  node release.mjs                                ║
║  node release.mjs --version 1.1.0                ║
║  node release.mjs --version 2.0.0 --dry-run     ║
╚══════════════════════════════════════════════════╝
`);
}

function main() {
  const opts = parseArgs();
  
  if (opts.help || opts.h) {
    showBanner();
    return;
  }

  const currentVersion = getCurrentVersion();
  console.log(`\n📦 当前版本: ${currentVersion}`);

  let targetVersion;
  if (opts.version) {
    // version can be "patch", "minor", "major", or a specific version like "1.0.0"
    if (['patch', 'minor', 'major'].includes(opts.version)) {
      targetVersion = bumpVersion(currentVersion, opts.version);
    } else {
      targetVersion = opts.version;
    }
    console.log(`🎯 目标版本: ${targetVersion}`);
  } else {
    // Default: bump patch
    targetVersion = bumpVersion(currentVersion, 'patch');
    console.log(`🎯 默认升级: ${currentVersion} → ${targetVersion} (patch)`);
  }

  doRelease(targetVersion, opts);
}

function doRelease(version, opts) {
  console.log(`\n🚀 准备发布 v${version}...\n`);
  
  if (opts.dryRun) {
    console.log('⚠️  DRY RUN 模式 - 以下操作不会真正执行\n');
  }

  // Step 1: Update version
  console.log('📝 Step 1: 更新版本号...');
  if (!opts.dryRun) {
    updatePackageVersion(version);
  } else {
    console.log(`  [DRY] 将 package.json 版本更新为 ${version}`);
  }

  // Step 2: Generate changelog
  console.log('📝 Step 2: 生成发布说明...');
  const notes = opts.notes || '## 🐛 Bug Fixes & Improvements\n\n- 完善手机局域网访问功能\n- 优化日历视图交互\n- 代码清理与文档完善';
  if (!opts.dryRun) {
    generateChangelog(version, notes);
  } else {
    console.log(`  [DRY] 将生成 release-notes.md`);
  }

  // Step 3: Build
  if (!opts.skipBuild) {
    console.log('📝 Step 3: 构建便携版...');
    if (!opts.dryRun) {
      try {
        build();
      } catch (e) {
        console.error('  ❌ 构建失败:', e.message);
        process.exit(1);
      }
    } else {
      console.log(`  [DRY] 将执行 node build-portable.js`);
    }
  }

  // Step 4: Git commit, tag, push
  console.log('📝 Step 4: 创建标签并推送...');
  if (!opts.dryRun) {
    gitCommitAndTag(version, opts.dryRun);
  }

  // Done
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  ✅ 发布流程完成！`);
  console.log(`  版本: v${version}`);
  console.log(`  标签: v${version}`);
  console.log(``);
  console.log(`  GitHub Actions 正在后台运行:`);
  console.log(`  1. 构建 Windows 便携版`);
  console.log(`  2. 创建 GitHub Release`);
  console.log(`  3. 上传 SmartCapture-Portable.zip`);
  console.log(``);
  console.log(`  查看进度: https://github.com/stevenabing163/SmartCapture/actions`);
  console.log(`  下载地址: https://github.com/stevenabing163/SmartCapture/releases`);
  console.log(`═══════════════════════════════════════\n`);
}

main();
