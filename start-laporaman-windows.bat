@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0backend"

echo ===============================================
echo  LaporAman - Local Development Launcher
echo ===============================================
echo.

where py >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python Launcher tidak ditemukan.
  echo Install Python 3.11 atau lebih baru, lalu jalankan file ini lagi.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/3] Membuat virtual environment...
  py -3 -m venv .venv
  if errorlevel 1 goto :error
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 goto :error

echo [2/3] Memastikan dependency tersedia...
python -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto :error

set "PYTHONPATH=."
set "SEED_DEMO_USERS=true"
set "BOOTSTRAP_PASSWORD=LaporAmanDemo!2026"
set "JWT_SECRET=local-dev-jwt-secret-change-before-deployment-2026"
set "APP_ENCRYPTION_KEY=local-dev-webhook-encryption-key-change-2026"
set "APP_ENV=development"

echo.
echo [3/3] Menjalankan backend LaporAman...
echo Server: http://127.0.0.1:8000
echo Health check: http://127.0.0.1:8000/api/health
echo Browser akan dibuka setelah backend benar-benar siap.
echo Tekan Ctrl+C untuk menghentikan server.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "$u='http://127.0.0.1:8000/api/health'; for($i=0; $i -lt 90; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 2; if($r.StatusCode -eq 200){ Start-Process 'http://127.0.0.1:8000'; exit 0 } } catch {} ; Start-Sleep -Seconds 1 }; exit 1"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
if errorlevel 1 goto :server_error
exit /b 0

:server_error
echo.
echo [ERROR] Backend gagal dijalankan. Periksa traceback di atas.
pause
exit /b 1

:error
echo.
echo [ERROR] Persiapan atau startup gagal. Periksa pesan di atas.
pause
exit /b 1
