// SmartCapture 安装与启动脚本
// 使用方法: node run.js [--dev]

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const IS_DEV = process.argv.includes('--dev');

async function main() {
  console.log('============================================');
  console.log('  SmartCapture 智能待办捕获 - 启动器');
  console.log('============================================\n');

  // 检查 Node.js 版本
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1));
  console.log(`[信息] Node.js 版本: ${nodeVersion}`);

  if (majorVersion < 18) {
    console.error('[错误] 需要 Node.js 18 或更高版本，当前版本:', nodeVersion);
    process.exit(1);
  }

  // 检查是否已安装依赖
  const nodeModulesPath = path.join(ROOT, 'node_modules');
  const electronPath = path.join(ROOT, 'node_modules', '.bin', 'electron');

  if (!fs.existsSync(nodeModulesPath)) {
    console.log('\n[步骤 1] 首次运行，正在安装依赖...');
    console.log('这可能需要几分钟时间，请耐心等待...\n');

    try {
      execSync('npm install', {
        cwd: ROOT,
        stdio: 'inherit',
        shell: true,
      });
      console.log('\n[成功] 依赖安装完成！');
    } catch (err) {
      console.error('\n[错误] 依赖安装失败');
      console.error('请检查网络连接，或尝试手动运行: npm install');
      process.exit(1);
    }
  } else {
    console.log('[信息] 依赖已安装');
  }

  // 检查 electron 是否可用
  const electronBin = path.join(ROOT, 'node_modules', '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron'
  );

  if (!fs.existsSync(electronBin)) {
    console.error('[错误] 未找到 Electron，请运行 npm install');
    process.exit(1);
  }

  // 启动应用
  console.log(`\n[步骤 2] 启动 SmartCapture${IS_DEV ? ' (开发模式)' : ''}...\n`);

  const args = [electronBin, '.'];
  if (IS_DEV) args.push('--dev');

  const child = spawn(process.platform === 'win32' ? 'cmd' : electronBin,
    process.platform === 'win32' ? ['/c', electronBin, '.', ...(IS_DEV ? ['--dev'] : [])] : ['.', ...(IS_DEV ? ['--dev'] : [])],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
    }
  );

  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`\n[提示] 程序退出，代码: ${code}`);
    }
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error('[错误] 启动失败:', err.message);
    process.exit(1);
  });
}

main().catch(err => {
  console.error('[错误] 启动异常:', err);
  process.exit(1);
});