@echo off
echo Starting Backend on Port 5501...
cd backend\AgentTeam.Api
dotnet run --urls=http://localhost:5501
pause
