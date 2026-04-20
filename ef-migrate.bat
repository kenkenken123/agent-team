@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Agent Team - Entity Framework Migration Tool
echo ===================================================
echo.
echo 1. Add Migration ^& Update Database (Auto)
echo 2. Add Migration only
echo 3. Update Database only
echo 4. Remove Last Migration
echo 5. List Migrations
echo 6. Exit
echo.

set /p choice="Select an option (1-6): "

if "%choice%"=="1" goto ADD_AND_UPDATE
if "%choice%"=="2" goto ADD_ONLY
if "%choice%"=="3" goto UPDATE_ONLY
if "%choice%"=="4" goto REMOVE_LAST
if "%choice%"=="5" goto LIST_MIGRATIONS
if "%choice%"=="6" exit /b

:ADD_AND_UPDATE
set "mname="
set /p mname="Enter migration name (leave blank for Auto): "
if "%mname%"=="" (
    for /f "tokens=*" %%a in ('powershell -Command "Get-Date -Format 'yyyyMMddHHmmss'"') do set "mname=Auto_%%a"
    echo [Info] No name provided. Using auto-generated name: !mname!
)
echo.
echo [Step 1/2] Adding migration: %mname%...
dotnet ef migrations add %mname% --project backend\AgentTeam.Api
if %errorlevel% neq 0 (
    echo [Error] Failed to add migration.
    pause
    exit /b
)
echo.
echo [Step 2/2] Updating database...
dotnet ef database update --project backend\AgentTeam.Api
if %errorlevel% neq 0 (
    echo [Error] Failed to update database.
) else (
    echo [Success] Database updated successfully.
)
pause
goto :EOF

:ADD_ONLY
set "mname="
set /p mname="Enter migration name (leave blank for Auto): "
if "%mname%"=="" (
    for /f "tokens=*" %%a in ('powershell -Command "Get-Date -Format 'yyyyMMddHHmmss'"') do set "mname=Auto_%%a"
    echo [Info] No name provided. Using auto-generated name: !mname!
)
dotnet ef migrations add %mname% --project backend\AgentTeam.Api
pause
goto :EOF

:UPDATE_ONLY
echo Updating database...
dotnet ef database update --project backend\AgentTeam.Api
pause
goto :EOF

:REMOVE_LAST
echo [Warning] This will remove the last migration that has NOT been applied to the database.
echo If it has been applied, you should rollback first.
set /p confirm="Are you sure? (y/n): "
if /i "%confirm%"=="y" (
    dotnet ef migrations remove --project backend\AgentTeam.Api
)
pause
goto :EOF

:LIST_MIGRATIONS
dotnet ef migrations list --project backend\AgentTeam.Api
pause
goto :EOF
