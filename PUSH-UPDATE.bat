@echo off
echo ========================================
echo   Realty Pandit - Push Update to Server
echo ========================================
echo.

REM Check if Git Bash is available
where bash >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git Bash not found!
    echo.
    echo Please install Git for Windows from: https://git-scm.com/download/win
    echo Or run this command manually in WSL/Git Bash:
    echo   ./push-update.sh
    pause
    exit /b 1
)

echo Running deployment script...
echo.

bash push-update.sh

echo.
echo Press any key to exit...
pause >nul
