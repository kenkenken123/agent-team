@echo off
setlocal
cd /d "%~dp0"

echo ===========================================
echo    Agent Console - Stop All Services
echo ===========================================

echo Cleaning up processes on ports 5501, 5502, 5503, 5504...
rem --- Clean common ports (5501: Backend, 5502: Frontend, 5503: PTY, 5504: WeChat) ---
for %%p in (5501 5502 5503 5504) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":%%p[ ]" 2^>nul') do (
        echo Killing process on port %%p with PID %%a
        taskkill /F /PID %%a /T 2>nul
    )
)

echo.
echo DONE. All services have been stopped.
timeout /t 2 /nobreak >nul
