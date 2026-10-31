@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0backend"

echo ===============================================
echo  LaporAman v2.0.1 - Local Demo Launcher
echo ===============================================
echo.

where py >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python Launcher tidak ditemukan.
  echo Install Python 3.11 atau lebih baru, lalu jalankan file ini lagi.
  pause
  exit /b 1
)

REM Reuse only this exact release. Do not accidentally attach to an older LaporAman process.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:8000/api/health'; $expected='laporaman-hackathon-demo-v2.0.1'; try { $r=Invoke-RestMethod -Uri $u -TimeoutSec 2; if($r.status -eq 'ok' -and $r.release -eq $expected -and $r.database_status -eq 'connected'){ Start-Process 'http://127.0.0.1:8000'; exit 0 } } catch {}; $p=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; if($p){ $ownerPid=$p[0].OwningProcess; $proc=Get-Process -Id $ownerPid -ErrorAction SilentlyContinue; Write-Host '[ERROR] Port 8000 digunakan server lain atau versi LaporAman lama.'; Write-Host ('PID: ' + $ownerPid + ' | Proses: ' + $proc.ProcessName); Write-Host 'Hentikan server lama dengan: taskkill /PID ' + $ownerPid + ' /T /F'; exit 2 }; exit 1"
if errorlevel 2 goto :port_error
if not errorlevel 1 (
  echo LaporAman sudah berjalan. Browser telah dibuka.
  exit /b 0
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
echo Browser akan dibuka setelah backend siap.
echo Tekan Ctrl+C untuk menghentikan server.
echo.
start "LaporAman browser readiness" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:8000/api/health'; for($i=0; $i -lt 90; $i++){ try { $r=Invoke-RestMethod -Uri $u -TimeoutSec 2; if($r.status -eq 'ok' -and $r.database_status -eq 'connected'){ Start-Process 'http://127.0.0.1:8000'; exit 0 } } catch {}; Start-Sleep -Seconds 1 }; Write-Host 'LaporAman tidak siap dalam 90 detik.'; exit 1"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
if errorlevel 1 goto :server_error
exit /b 0

:port_error
echo.
echo [ERROR] Port 8000 sedang digunakan server lain atau versi lama.
echo Jalankan perintah taskkill yang ditampilkan di atas untuk menghentikan PID lama.
echo Setelah itu, jalankan kembali launcher dari folder v2.0.1.
pause
exit /b 2

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
