@echo off
setlocal

REM Always run from the project root (parent of this scripts folder)
set "PROJECT_ROOT=%~dp0.."
cd /d "%PROJECT_ROOT%"
echo [INFO] Working directory: %CD%

REM ---- Check Python ----
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.9+ and add to PATH.
    exit /b 1
)
echo [OK] Python found.

REM ---- Virtual environment ----
if not exist ".venv_sidecar" (
    echo [INFO] Creating virtual environment...
    python -m venv .venv_sidecar
)
echo [INFO] Activating virtual environment...
call ".venv_sidecar\Scripts\activate.bat"

REM ---- Install packages ----
echo [INFO] Installing dependencies...
pip install --upgrade --quiet fastapi uvicorn python-multipart faster-whisper pyinstaller

REM ---- Build with PyInstaller (all args on one line) ----
echo [INFO] Running PyInstaller...
pyinstaller --onefile --name whisper_sidecar-x86_64-pc-windows-msvc --hidden-import faster_whisper --hidden-import uvicorn --hidden-import fastapi --hidden-import pydantic --hidden-import python_multipart --hidden-import ctranslate2 --hidden-import tokenizers --hidden-import huggingface_hub --collect-all faster_whisper --collect-all ctranslate2 "src-tauri\bin\whisper_sidecar.py"

if errorlevel 1 (
    echo [ERROR] PyInstaller build failed!
    call ".venv_sidecar\Scripts\deactivate.bat"
    exit /b 1
)

REM ---- Copy exe to Tauri bin ----
echo [INFO] Copying exe...
copy /Y "dist\whisper_sidecar-x86_64-pc-windows-msvc.exe" "src-tauri\bin\whisper_sidecar-x86_64-pc-windows-msvc.exe"
if errorlevel 1 (
    echo [ERROR] Copy failed!
    call ".venv_sidecar\Scripts\deactivate.bat"
    exit /b 1
)

REM ---- Cleanup ----
rmdir /S /Q build
rmdir /S /Q dist
del /Q "whisper_sidecar-x86_64-pc-windows-msvc.spec" 2>nul

call ".venv_sidecar\Scripts\deactivate.bat"

echo.
echo [SUCCESS] Build complete!
echo Output: src-tauri\bin\whisper_sidecar-x86_64-pc-windows-msvc.exe
endlocal
