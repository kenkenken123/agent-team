@echo off
setlocal
title AgentConsole-Launcher

echo ===========================================
echo    Agent Console - All Services Restarter
echo ===========================================

echo [1/3] Cleaning up old processes
rem --- Clean common ports ---
for %%p in (5501 5502 5503) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        echo Killing process on port %%p with PID %%a
        taskkill /F /PID %%a /T 2>nul
    )
)

timeout /t 2 /nobreak >nul

echo [2/3] Starting Services
start "PTY" cmd /c ".\run-pty.bat"
start "Backend" cmd /c ".\run-backend.bat"
start "Frontend" cmd /c ".\run-frontend.bat"

echo [3/3] DONE
echo Backend:  5501
echo Frontend: 5502
echo PTY:      5503
echo Wait a few seconds for initialization.
