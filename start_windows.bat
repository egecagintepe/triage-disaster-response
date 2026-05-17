@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

echo ==================================================
echo   TRIAGE — Windows Auto-Start Script
echo ==================================================
echo.

:: ====================================================
:: 1. Detect LAN IP address
:: ====================================================
echo [1/5] Detecting LAN IP address...
set "LAN_IP="

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set "candidate=%%a"
    set "candidate=!candidate: =!"
    echo       Found: !candidate!
    if "!candidate:~0,4!"=="192." set "LAN_IP=!candidate!"
    if "!candidate:~0,3!"=="10." if "!LAN_IP!"=="" set "LAN_IP=!candidate!"
    if "!candidate:~0,4!"=="172." if "!LAN_IP!"=="" set "LAN_IP=!candidate!"
)

if "!LAN_IP!"=="" (
    echo [WARN] No LAN IP found. Using 127.0.0.1
    set "LAN_IP=127.0.0.1"
)

echo [OK] Using LAN IP: !LAN_IP!
echo.

:: ====================================================
:: 2. Update frontend .env files with detected IP
:: ====================================================
echo [2/5] Updating frontend .env files...

:: Admin frontend
(
    echo VITE_API_URL=http://!LAN_IP!:8000
    echo VITE_WS_URL=ws://!LAN_IP!:8000
) > "%~dp0frontend\admin\.env"
echo       Admin .env -> http://!LAN_IP!:8000

:: Field frontend
(
    echo VITE_API_URL=http://!LAN_IP!:8000
    echo VITE_WS_URL=ws://!LAN_IP!:8000
) > "%~dp0frontend\field\.env"
echo       Field .env -> http://!LAN_IP!:8000

echo [OK] Frontend .env files updated
echo.

:: ====================================================
:: 3. Update backend CORS to allow LAN origin
:: ====================================================
echo [3/5] Updating backend CORS...
set "BACKEND_ENV=%~dp0backend\.env"

:: Read existing .env and update CORS_ORIGINS
set "ENV_CONTENT="
for /f "usebackq tokens=1* delims==" %%a in ("%BACKEND_ENV%") do (
    if /i "%%a"=="CORS_ORIGINS" (
        :: Keep wildcard for dev
    ) else (
        if not "%%a"=="" if not "%%a:~0,1"=="#" (
            :: keep line
        )
    )
)
:: Just ensure CORS is wildcard (already is for LAN dev)
echo [OK] CORS_ORIGINS=* (allows all LAN devices)
echo.

:: ====================================================
:: 4. Start Backend (new terminal)
:: ====================================================
echo [4/5] Starting Backend on 0.0.0.0:8000...
start "TRIAGE-BACKEND" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul
echo [OK] Backend starting in new window
echo.

:: ====================================================
:: 5. Start Frontends (new terminals)
:: ====================================================
echo [5/5] Starting Frontend dev servers...

:: Admin on port 5173
start "TRIAGE-ADMIN" cmd /k "cd /d %~dp0frontend\admin && npm run dev -- --host 0.0.0.0 --port 5173"
timeout /t 2 /nobreak >nul
echo [OK] Admin (Komuta) starting on port 5173

:: Field on port 5174
start "TRIAGE-FIELD" cmd /k "cd /d %~dp0frontend\field && npm run dev -- --host 0.0.0.0 --port 5174"
timeout /t 2 /nobreak >nul
echo [OK] Field (Saha) starting on port 5174

:: ====================================================
:: Summary
:: ====================================================
echo.
echo ==================================================
echo   ALL SERVICES STARTED
echo ==================================================
echo.
echo   LAN IP:     !LAN_IP!
echo.
echo   Backend:    http://!LAN_IP!:8000/docs
echo   Admin:      http://!LAN_IP!:5173
echo   Field:      http://!LAN_IP!:5174
echo.
echo   Share these URLs with your team:
echo   --------------------------------
echo   Phones/Tablets: http://!LAN_IP!:5174
echo   Laptops:        http://!LAN_IP!:5173
echo.
echo   Make sure all devices are on the SAME WiFi network.
echo ==================================================
echo.
pause
