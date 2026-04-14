@echo off
TITLE WeChat iLink Service
cd /d %~dp0
echo [1/2] Starting WeChat iLink Service...

:: Check if node_modules exists
if not exist node_modules (
    echo [2/2] Installing dependencies...
    call npm install
)

:: Configuration
set BACKEND_URL=http://localhost:5501
set WECHAT_SERVICE_PORT=5504
set WECHAT_STORAGE_DIR=./.wechatbot-data

echo [RUN] npx tsx src/index.ts
npx tsx src/index.ts
echo.
echo Service stopped (Exit Code: %ERRORLEVEL%).
pause
