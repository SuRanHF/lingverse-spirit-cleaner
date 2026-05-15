@echo off
cd /d "%~dp0"
where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" -Interactive
) else (
    chcp 65001 >nul
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" -Interactive
)
echo.
pause
