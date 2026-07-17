@echo off
setlocal
set "PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%PYTHON%" goto run
where py.exe >nul 2>nul && set "PYTHON=py.exe" && goto run
where python.exe >nul 2>nul && set "PYTHON=python.exe" && goto run

echo Cannot find Python. Open reader\index.html and use "Open JSON" instead.
pause
exit /b 1

:run
"%PYTHON%" "%~dp0serve_reader.py"
if errorlevel 1 pause
