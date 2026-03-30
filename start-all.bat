@echo off
echo Starting Backend...
start "Backend" cmd /k ".\run-backend.bat"

echo Starting Frontend...
start "Frontend" cmd /k ".\run-frontend.bat"

echo All services are starting in separate windows!
