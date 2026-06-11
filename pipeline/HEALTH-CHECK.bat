@echo off
title Realty Pandit - Health Check
echo ============================================
echo   Realty Pandit - Health Check
echo ============================================
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

REM Run health check
bash pipeline/health-check.sh

echo.
echo Press any key to exit...
pause >nul
