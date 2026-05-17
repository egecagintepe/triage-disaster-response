<div align="center">

# TRIAGE — Autonomous Disaster Response Intelligence

**AI-Powered Earthquake Triage: System for Field Operations**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-2.0_Flash-4285F4?style=for-the-badge&logo=google)](https://ai.google.dev)
[![PWA](https://img.shields.io/badge/PWA-Offline_First-5A0FC8?style=for-the-badge&logo=pwa)](https://web.dev/progressive-web-apps/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)

*When the earthquake strikes and the internet dies, TRIAGE keeps operating.*

</div>

---

## The Problem

After a major earthquake, communication infrastructure collapses within minutes. Emergency teams lose coordination, duplicate efforts waste critical time, and lives are lost in the chaos. Traditional cloud-dependent systems become useless the moment they are needed most.

## The Solution

TRIAGE is an internet-independent, AI-driven disaster response system that operates entirely on a local area network. A single master node (such as a Raspberry Pi or Mini-PC) runs the entire stack — backend, AI engine, and serves both the Command Center and Field Apps over a local WiFi network.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    MASTER NODE (LAN)                        │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │  Nginx   │  │  FastAPI +   │  │  Gemini AI Engine  │     │
│  │          │──│  Uvicorn     │──│  (Structured JSON) │     │
│  │          │  │              │  │  + Fallback Rules  │     │
│  └──────────┘  └──────┬───────┘  └────────────────────┘     │
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

## Key Features

### Autonomous AI Triage
- **Live Earthquake Data:** Fetches from Kandilli Observatory API (`api.orhanaydogdu.com.tr`).
- **Gemini 2.0 Flash:** Analyzes epicenter, population density, soil type, and building age.
- **Structured JSON Output:** Uses `response_schema` to prevent parsing errors.
- **Deterministic Fallback:** Rule-based scoring when AI is unavailable.
- **Auto-Dispatch:** Tasks are assigned to the nearest idle team via Haversine distance.

### Offline-First Architecture
- **Dexie.js:** Local database on every field device.
- **SyncQueue (Outbox Pattern):** Operations are queued offline and synced when online.
- **WebSocket Real-Time Sync:** Features timestamp-based conflict resolution.
- **Service Worker (Workbox):** UI loads instantly even if the network drops.
- **Map Tile Caching:** OpenStreetMap / Carto tiles are cached for 30 days.

### Dual-Interface Design
- **Komuta Merkezi (Admin):** Landscape dashboard with react-leaflet map, team management, AI analysis trigger, and intelligence log.
- **Saha Uygulamasi (Field):** Portrait mobile PWA with swipe-to-action buttons, GPS tracking, and offline task updates.

### Disaster-Proof Deployment
- **No Docker, No Cloud:** Bare-metal `systemd` + Nginx.
- **Single Setup Script:** `scripts/setup_server.sh` handles everything.
- **Auto-Restart on Boot:** `triage-backend.service` configured with `Restart=always`.
- **WiFi Hotspot:** Works on any portable router or phone tethering.

---

## Quick Start

### Prerequisites
- **Python 3.11+** and **Node.js 18+**
- Optional: `GEMINI_API_KEY` in `backend/.env` for live AI analysis

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Admin Dashboard Setup
```bash
cd frontend/admin
npm install
npm run dev
```

### 3. Field App Setup
```bash
cd frontend/field
npm install
npm run dev

---

## Project Structure

```text
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
│   └── USER_GUIDE.md           # Turkish user guide
└── architecture.md             # Full system design document
```

---

## Tech Stack

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

## Performance Metrics

| Metric | Value |
|--------|-------|
| API response (GZip) | ~40% smaller payloads |
| SQLite WAL mode | Concurrent reads during writes |
| PWA precache | Admin: 661 KiB, Field: 635 KiB |
| Map tile cache | 500 tiles, 30-day expiry |
| Task auto-assign | < 50ms (Haversine + priority sort) |
| Full AI analysis | ~3s (Gemini) / instant (fallback) |

---

## Team

**EBST Hackathon 2026** — Built under pressure.

---

<div align="center">

*"İnternet yokken bile hayat kurtarır."*

**TRIAGE** — When every second counts.

</div>
