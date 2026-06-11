@echo off
echo Registering GlitchTip nightly digest task...

schtasks /Create ^
  /TN "RealtypanditGlitchtipDigest" ^
  /TR "node \"C:\Users\Varchasv Bhardwaj\Project\clients\sunny-sharma\projects\reality-pandit\agents\monitor\glitchtip-digest.js\"" ^
  /SC DAILY ^
  /ST 00:00 ^
  /F

if %ERRORLEVEL% == 0 (
  echo.
  echo SUCCESS: Task registered. Will run every night at midnight.
  echo To verify: schtasks /Query /TN "RealtypanditGlitchtipDigest"
) else (
  echo.
  echo FAILED: Try running this file as Administrator.
  echo Right-click register-task.bat and choose "Run as administrator"
)

pause
