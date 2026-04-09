@echo off
setlocal
cd /d "%~dp0"

echo ===========================================
echo    Agent Console - Hidden Launcher
echo ===========================================

echo [1/2] Cleaning up old processes...
for %%p in (5501 5502 5503) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        echo Killing process on port %%p (PID %%a)
        taskkill /F /PID %%a /T 2>nul
    )
)

timeout /t 1 /nobreak >nul

echo [2/2] Starting Services (Background/Hidden)...

rem --- Starting PTY Server ---
powershell -WindowStyle Hidden -Command "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory 'pty-server' -WindowStyle Hidden"

rem --- Starting Backend (with debugging logs) ---
powershell -WindowStyle Hidden -Command "Start-Process -FilePath 'dotnet' -ArgumentList 'run', '--urls=http://localhost:5501' -WorkingDirectory 'backend\AgentTeam.Api' -WindowStyle Hidden -RedirectStandardOutput 'backend_log.txt' -RedirectStandardError 'backend_err.txt'"

rem --- Starting Frontend ---
powershell -WindowStyle Hidden -Command "Start-Process -FilePath 'npm' -ArgumentList 'run', 'dev' -WorkingDirectory 'frontend' -WindowStyle Hidden"

echo.
echo DONE!
echo Backend:  http://localhost:5501
echo Frontend: http://localhost:5502
echo PTY:      ws://localhost:5503
echo.
echo Services are now running in the background.
echo Check 'backend_err.txt' or 'backend_log.txt' if backend fails to start.
echo.
