@echo off
setlocal
title Vaakil AI
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install Node.js 24 LTS from https://nodejs.org and then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo First run: installing libraries. This takes 5-10 minutes...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. See the messages above.
    pause
    exit /b 1
  )
)

if not exist ".env.local" (
  echo.
  echo Setting up the database and loading templates and bare acts...
  echo.
  call npm run setup
  if errorlevel 1 (
    echo.
    echo Setup failed. See the messages above.
    pause
    exit /b 1
  )
  echo.
  echo Write down the admin email and password printed above.
  echo.
  pause
)

rem Open the browser after the app has had a few seconds to start.
start "" cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:3000"

call npm run local
pause
