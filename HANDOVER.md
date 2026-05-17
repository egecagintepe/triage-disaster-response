# TRIAGE V2 — Project Handover & Context

This document summarizes the exact state of the TRIAGE V2 disaster management project. Provide this to the new AI session to restore context immediately.

## 1. System Architecture
**Core Concept:** Offline-first, master-node-based disaster management platform designed to work on local LANs during internet outages, but also accessible via public domains (Reverse Proxy).
- **Backend:** FastAPI, Python, SQLAlchemy (Async SQLite), Uvicorn. Runs on port `8000`.
- **Admin Frontend (Komuta):** React, Vite, Tailwind, Zustand, Dexie.js (for offline sync), Leaflet. Runs on port `5173`.
- **Field Frontend (Saha):** Same stack as Admin, optimized for mobile UI. Runs on port `5174`.

## 2. Network & Infrastructure Setup (CRITICAL)
We recently transitioned the system to support BOTH local LAN access and Public Internet (HTTPS) access simultaneously without Mixed Content errors.

- **Nginx Proxy Manager (NPM):** Deployed on the local network (`100.73.110.71` / `172.52.200.123`).
  - Handles SSL termination for `komutamerkezi.gokberkceviker.com.tr` and `saha.gokberkceviker.com.tr`.
  - Routes `/api` and `/ws` to `http://172.52.200.123:8000`.
- **Oracle Cloud Proxy:** Acts as a pure TCP `stream` proxy forwarding port 80/443 traffic directly to the home NPM instance. (Note: `proxy_set_header` is intentionally omitted here to prevent Layer 4 crashes).
- **FastAPI/Uvicorn:** Runs with `--proxy-headers --forwarded-allow-ips "*"` to read `X-Forwarded-For` from NPM, ensuring real client IPs are logged instead of the proxy IP.

## 3. Frontend API/WS Resolution Logic (`api.ts`)
To prevent `Mixed Content` security errors when accessing via HTTPS, both frontends dynamically determine their API URLs based on the browser's `window.location`:
- If accessed via `https://domain.com`, the API resolves to `https://domain.com` and WebSockets to `wss://domain.com`.
- If accessed via local IP (`http://172.x.x.x`), it falls back to `http://172.x.x.x:8000` and `ws://172.x.x.x:8000`.
- **File References:** `frontend/admin/src/services/api.ts` and `frontend/field/src/services/api.ts`.

## 4. Deployment Scripts
- **Linux (`start_linux.sh`):** Auto-detects the machine's LAN IP, injects it into `.env` files, runs `npm install` if `node_modules` is missing, and starts all 3 services in the background using `&`.
- **Windows (`start_windows.bat`):** Similar logic, but uses `start cmd /k` to open separate terminal windows.

## 5. Recent Fixes & Current Status
1. **Dependencies:** Added missing `reconnecting-websocket` and `sonner` to `frontend/field/package.json`.
2. **Database:** Async SQLite engine is fully operational (requires `greenlet` package, which was added to `requirements.txt`).
3. **AI Triage Loop:** Background `asyncio` loops are running correctly in FastAPI to poll Kandilli/AFAD and generate zones.

## 6. Next Steps / Known Quirks
- The project is fully stable locally and remotely.
- The next developer/AI should focus on UI/UX enhancements, mapping features, or testing the Dexie.js offline-sync queue by simulating network drops.
