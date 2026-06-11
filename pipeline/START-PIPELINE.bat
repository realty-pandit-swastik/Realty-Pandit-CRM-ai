@echo off
title Realty Pandit - Auto Deploy Watcher
echo ============================================
echo   Realty Pandit - Auto Deploy Pipeline
echo ============================================
echo.
echo This will watch for changes in agents/ and
echo automatically deploy to the server.
echo.
echo Press Ctrl+C in the watcher window to stop.
echo.

REM Check if Git Bash is available
where bash >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git Bash not found!
    echo.
    echo Please install Git for Windows from:
    echo   https://git-scm.com/download/win
    echo.
    echo Or use WSL (Windows Subsystem for Linux).
    pause
    exit /b 1
)

REM Change to project directory
cd /d "%~dp0.."

REM Copy SSH key to /tmp (required for scripts with spaces in path)
echo Preparing SSH key...
bash -c "cp '$HOME/.ssh/realty_pandit_key' /tmp/rp_key 2>/dev/null && chmod 600 /tmp/rp_key && echo 'SSH key ready'" 2>nul
echo.

REM Start watcher in a new window + show live log
echo Starting watcher...
echo.

REM Start the watcher script in background
start "RP Deploy Watcher" bash pipeline/watch-and-deploy.sh

REM Give it a moment to start
timeout /t 2 /nobreak >nul

REM Open log tail in current window
echo ============================================
echo   LIVE DEPLOY LOG (pipeline/deploy.log)
echo   Close this window or Ctrl+C to stop
echo ============================================
echo.

bash -c "tail -f pipeline/deploy.log 2>/dev/null || echo 'Waiting for log...'; sleep 5; tail -f pipeline/deploy.log"

pause
