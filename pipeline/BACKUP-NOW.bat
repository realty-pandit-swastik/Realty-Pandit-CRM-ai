@echo off
title Realty Pandit - Backup
echo ============================================
echo   Realty Pandit - Backup Tool
echo ============================================
echo.
echo This will backup:
echo   1. PostgreSQL database (reality_pandit)
echo   2. Server source code
echo   to: pipeline\backups\
echo.
echo Backups older than 7 days will be deleted.
echo.

REM Check if Git Bash is available
where bash >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git Bash not found!
    echo Please install Git for Windows.
    pause
    exit /b 1
)

REM Change to project directory
cd /d "%~dp0.."

REM Run backup script
bash pipeline/backup.sh

echo.
echo Press any key to exit...
pause >nul
