@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-docker.ps1" -InstallDirectory "%~dp0."
echo.
pause
