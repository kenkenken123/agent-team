@echo off
setlocal
cd /d "%~dp0"

echo ===========================================
echo    Agent Console - Stop All Services
echo ===========================================

echo Cleaning up processes on ports 5501, 5502, 5503...
for %%p in (5501 5502 5503) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        echo Killing process on port %%p with PID %%a
        taskkill /F /PID %%a /T 2>nul
    )
)

echo.
echo DONE. All services have been stopped.
timeout /t 2 /nobreak >nul
pause
