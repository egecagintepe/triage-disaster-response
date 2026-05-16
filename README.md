<div align="center">

# 🚨 TRIAGE V2 — Autonomous Disaster Response Intelligence

**AI-Powered Earthquake Triage System for Field Operations**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-2.0_Flash-4285F4?style=for-the-badge&logo=google)](https://ai.google.dev)
[![PWA](https://img.shields.io/badge/PWA-Offline_First-5A0FC8?style=for-the-badge&logo=pwa)](https://web.dev/progressive-web-apps/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)

*When the earthquake strikes and the internet dies, TRIAGE V2 keeps operating.*

</div>

---

## 🎯 The Problem

After a major earthquake, **communication infrastructure collapses within minutes**. Emergency teams lose coordination, duplicate efforts waste critical time, and lives are lost in the chaos. Traditional cloud-dependent systems become useless the moment they're needed most.

## 💡 The Solution

**TRIAGE V2** is an **internet-independent, AI-driven disaster response system** that operates entirely on a local area network. A single master node (Raspberry Pi or Mini-PC) runs the entire stack — backend, AI engine, and serves both the Command Center and Field Apps over WiFi.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MASTER NODE (LAN)                        │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  Nginx   │  │  FastAPI +   │  │  Gemini AI Engine  │    │
│  │  :8080   │──│  Uvicorn     │──│  (Structured JSON) │    │
│  │  :8081   │  │  :8000       │  │  + Fallback Rules  │    │
│  └──────────┘  └──────┬───────┘  └────────────────────┘    │
│                       │ WebSocket                           │
│              ┌────────┴────────┐                            │
│              │   SQLite + WAL  │                            │
│              │   (data/triage) │                            │
│              └─────────────────┘                            │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
        ┌─────────┴──────┐     ┌──────────┴───────┐
        │  ADMIN PWA     │     │  FIELD PWA       │
        │  (Komuta)      │     │  (Saha)          │
        │  Landscape     │     │  Portrait        │
        │  react-leaflet │     │  Geolocation API │
        │  Real-time map │     │  Swipe actions   │
        │  Zustand       │     │  Dexie.js (local)│
        └────────────────┘     └──────────────────┘
```

---

## ⚡ Key Features

### 🤖 Autonomous AI Triage
- **Live earthquake data** from Kandilli Observatory API (`api.orhanaydogdu.com.tr`)
- **Gemini 2.0 Flash** analyzes epicenter, population density, soil type, and building age
- **Structured JSON output** via `response_schema` — no regex, no parsing errors
- **Deterministic fallback** — rule-based scoring when AI is unavailable
- **Auto-dispatch** — tasks assigned to nearest idle team via Haversine distance

### 📡 Offline-First Architecture
- **Dexie.js** local database on every field device
- **SyncQueue (Outbox Pattern)** — operations queued offline, synced when online
- **WebSocket real-time sync** with timestamp-based conflict resolution
- **Service Worker (Workbox)** — UI loads instantly even if network drops
- **Map tile caching** — OpenStreetMap / Carto tiles cached for 30 days

### 🗺️ Dual-Interface Design
- **Komuta Merkezi (Admin)** — Landscape dashboard with react-leaflet map, team management, AI analysis trigger, intelligence log
- **Saha Uygulaması (Field)** — Portrait mobile PWA with swipe-to-action buttons, GPS tracking, offline task updates

### 🛡️ Disaster-Proof Deployment
- **No Docker, no cloud** — bare-metal `systemd` + Nginx
- **Single setup script** — `scripts/setup_server.sh` handles everything
- **Auto-restart on boot** — `triage-backend.service` with `Restart=always`
- **WiFi hotspot** — works on any portable router or phone tethering

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+** and **Node.js 18+**
- Optional: `GEMINI_API_KEY` in `backend/.env` for live AI analysis

### 1. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Admin Dashboard
```bash
cd frontend/admin
npm install
npm run dev    # → http://localhost:5173
```

### 3. Field App
```bash
cd frontend/field
npm install
npm run dev    # → http://localhost:5174
```

### 4. Production Deployment (Linux)
```bash
sudo ./scripts/setup_server.sh
# Admin: http://<IP>:8080
# Field: http://<IP>:8081
# API:   http://<IP>:8000/docs
```

---

## 🧪 Testing

```bash
cd backend
python -m pytest tests/ -v
```

```
tests/test_ai.py    — 4 tests (mocked Gemini, fallback, priority mapping, coord offsets)
tests/test_api.py   — 8 tests (device auth, task CRUD, team management)
tests/test_sync.py  — 5 tests (conflict resolution, timestamp comparison, batch sync)
────────────────────
17 passed ✅
```

---

## 📂 Project Structure

```
ebhack-26-dev-gaes/
├── backend/
│   ├── main.py                 # FastAPI + WebSocket + GZip
│   ├── database.py             # SQLite + WAL + async sessions
│   ├── services/
│   │   ├── afad_client.py      # Live Kandilli API + simulated zones
│   │   ├── ai_engine.py        # Gemini 2.0 Flash (structured output)
│   │   ├── task_generator.py   # Zone + Task creation (spiral offsets)
│   │   ├── dispatcher.py       # Auto-assignment (Haversine nearest)
│   │   └── sync_service.py     # Conflict resolution engine
│   ├── routes/
│   │   ├── admin.py            # AI analysis orchestration
│   │   ├── tasks.py            # CRUD + dispatcher hooks
│   │   ├── teams.py            # Team management
│   │   └── auth.py             # JWT device authentication
│   └── tests/                  # pytest + httpx + async
├── frontend/
│   ├── admin/                  # React + Vite + PWA (Komuta)
│   └── field/                  # React + Vite + PWA (Saha)
├── scripts/
│   └── setup_server.sh         # Bare-metal deployment
├── docs/
│   └── USER_GUIDE.md           # Türkçe kullanım kılavuzu
└── architecture.md             # Full system design document
```

---

## 🏆 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **AI** | Google Gemini 2.0 Flash | Zone prioritization, casualty estimation |
| **Backend** | FastAPI + SQLAlchemy | Async API, WebSocket, JWT auth |
| **Database** | SQLite + WAL mode | Zero-config, high-concurrency writes |
| **Admin UI** | React 19 + react-leaflet | Real-time map, team management |
| **Field UI** | React 19 + Dexie.js | Offline-first mobile PWA |
| **Sync** | WebSocket + SyncQueue | Outbox pattern, conflict resolution |
| **Deploy** | systemd + Nginx | Auto-start, reverse proxy, static files |
| **Data** | Kandilli Observatory API | Live earthquake data (magnitude, depth, coords) |

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| API response (GZip) | ~40% smaller payloads |
| SQLite WAL mode | Concurrent reads during writes |
| PWA precache | Admin: 661 KiB, Field: 635 KiB |
| Map tile cache | 500 tiles, 30-day expiry |
| Task auto-assign | < 50ms (Haversine + priority sort) |
| Full AI analysis | ~3s (Gemini) / instant (fallback) |

---

## 👥 Team

**EBST Hackathon 2026** — Built with 🔥 under pressure.

---

<div align="center">

*"İnternet yokken bile hayat kurtarır."*

**TRIAGE V2** — When every second counts.

</div>
