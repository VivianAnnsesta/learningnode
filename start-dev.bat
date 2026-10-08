@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-dev.ps1" %*

if errorlevel 1 (
  echo.
  echo Electron development environment failed to start.
  pause
)
