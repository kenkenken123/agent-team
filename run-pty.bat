@echo off
echo Starting PTY Server...
cd /d "%~dp0pty-server"
start "PTY Server" cmd /k "node server.js"
echo PTY Server is starting on port 3001!
