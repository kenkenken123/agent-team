@echo off
setlocal
cd /d "%~dp0"
title AgentConsole-Launcher

echo ===========================================
echo    Agent Console - All Services Restarter
echo ===========================================

echo [1/3] Cleaning up old processes...
rem --- Clean common ports (5501: Backend, 5502: Frontend, 5503: PTY, 5504: WeChat) ---
for %%p in (5501 5502 5503 5504 5505) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":%%p[ ]" 2^>nul') do (
        echo Killing process on port %%p with PID %%a
        taskkill /F /PID %%a /T 2>nul
    )
)

timeout /t 2 /nobreak >nul

echo [2/3] Starting Services
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c .\run-pty.bat' -WindowStyle Hidden"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c .\run-frontend.bat' -WindowStyle Hidden"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c .\run-saas-frontend.bat' -WindowStyle Hidden"
start "Backend" cmd /c ".\run-backend.bat"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c wechat-service\run-wechat.bat' -WindowStyle Hidden"

echo [3/3] DONE
echo Backend:  5501
echo Frontend: 5502
echo PTY:      5503
echo WeChat:   5504
echo SaaS:     5505
echo Wait a few seconds for initialization.
