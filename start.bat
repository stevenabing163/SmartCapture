@echo off
chcp 65001 >nul
title SmartCapture - 智能待办捕获

echo ============================================
echo   SmartCapture 智能待办捕获 - 一键启动
echo ============================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [信息] 检测到 Node.js 版本: %NODE_VER%

if not exist "node_modules" (
    echo.
    echo [步骤 1] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [提示] 如果 npm install 失败，请检查网络连接
        echo        或尝试设置镜像: npm config set registry https://registry.npmmirror.com
        echo.
        pause
        exit /b 1
    )
) else (
    echo [信息] 依赖已安装，跳过 npm install
)

echo.
echo [步骤 2] 启动 SmartCapture...
echo.

REM 使用 node 直接调用 electron，避免 npx 问题
if "%1"=="--dev" (
    node node_modules\electron\cli.js . --dev
) else (
    start "" node node_modules\electron\cli.js .
)

if %errorlevel% neq 0 (
    echo.
    echo [错误] 程序异常退出，错误代码: %errorlevel%
    echo.
    echo 常见问题排查:
    echo   1. 确认已安装 Node.js 18 或更高版本
    echo   2. 尝试删除 node_modules 后重新运行
    echo   3. 检查 electron 二进制文件是否完整下载
    pause
)

exit /b 0