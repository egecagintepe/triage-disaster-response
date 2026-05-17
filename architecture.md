TRIAGE - System Architecture Documentation
markdown# TRIAGE - Offline-First Afet Yönetim Sistemi
## Sistem Mimarisi ve Teknik Dokümantasyon

---

## 📋 İçindekiler

1. [Sistem Genel Bakış](#sistem-genel-bakış)
2. [Mimari Prensipler ve Tasarım Kararları](#mimari-prensipler-ve-tasarım-kararları)
3. [Ağ Topolojisi ve Altyapı](#ağ-topolojisi-ve-altyapı)
4. [Teknoloji Stack Detayları](#teknoloji-stack-detayları)
5. [Veritabanı Mimarisi](#veritabanı-mimarisi)
6. [API Katmanı ve Endpoint Tasarımı](#api-katmanı-ve-endpoint-tasarımı)
7. [Frontend Mimarisi](#frontend-mimarisi)
8. [Offline-First Mimari ve Senkronizasyon Stratejisi](#offline-first-mimari-ve-senkronizasyon-stratejisi)
9. [AI Entegrasyonu ve Önceliklendirme Algoritması](#ai-entegrasyonu-ve-önceliklendirme-algoritması)
10. [Güvenlik ve Hata Yönetimi](#güvenlik-ve-hata-yönetimi)
11. [Proje Klasör Yapısı](#proje-klasör-yapısı)
12. [Geliştirme Aşamaları ve Roadmap](#geliştirme-aşamaları-ve-roadmap)
13. [Frontend Şablon Entegrasyon Planı](#frontend-şablon-entegrasyon-planı)
14. [Deployment ve DevOps](#deployment-ve-devops)
15. [Test Stratejisi](#test-stratejisi)
16. [Performans Optimizasyonu](#performans-optimizasyonu)
17. [Ekip Rolleri ve Sorumluluklar](#ekip-rolleri-ve-sorumluluklar)

---

## 1. Sistem Genel Bakış

### 1.1 Vizyon
**"Depremde internet çöktüğünde bile çalışan sistem."**

TRIAGE, afet anında kritik altyapının (internet, GSM) çöktüğü senaryoda bile kesintisiz çalışabilen, asimetrik bir afet yönetim platformudur.

### 1.2 Temel Çalışma Prensibi
[Kandilli/AFAD API] → [Master Node AI Processing] → [Local Network Distribution]
↓
[WebSocket Sync Layer]
↓
[Field Devices with Local DB]
↓
[Autonomous Operation]

### 1.3 Kritik Özellikler

- **Internet-Independent:** İnternet kesintisinde bile %100 operasyonel
- **AI-Powered Triage:** Gemini API ile otomatik önceliklendirme
- **Real-time Sync:** WebSockets ile milisaniye seviyesinde senkronizasyon
- **Dynamic Task Assignment:** Ekiplere otomatik ve dinamik görev dağılımı
- **Offline-First:** Tüm operasyonlar offline modda çalışabilir
- **Zero-Latency UX:** Kullanıcı hiçbir zaman "loading" görmez

---

## 2. Mimari Prensipler ve Tasarım Kararları

### 2.1 Temel Prensipler

#### 2.1.1 Offline-First Architecture
```javascript
// Her veri yazma işlemi önce lokalde gerçekleşir
async function saveTask(task) {
  // 1. Önce lokal veritabanına yaz (instant)
  await localDB.tasks.put(task);
  
  // 2. UI'ı hemen güncelle
  updateUI(task);
  
  // 3. Arka planda sync kuyruğuna ekle
  syncQueue.add(task);
  
  // 4. Bağlantı varsa otomatik sync
  if (isOnline) {
    await syncWithServer(task);
  }
}
```

#### 2.1.2 Eventual Consistency
- Verinin mutlak doğruluğu yerine **operasyonel süreklilik** öncelikli
- Çakışmalar "last-write-wins" + timestamp stratejisi ile çözülür
- Kritik çakışmalar manual review için flaglenir

#### 2.1.3 Asimetrik UI Design
- **Master Node UI:** Veri yoğunluklu, analitik, geniş ekran optimizasyonu
- **Field Device UI:** Aksiyon odaklı, minimum kognitif yük, büyük touch targets

#### 2.1.4 Fail-Safe Operations
```javascript
// Her kritik işlem için fallback mekanizması
try {
  await apiCall();
} catch (error) {
  // API başarısız → lokal işlem devam eder
  await localFallback();
  // Hata loglanır ama kullanıcı kesinti yaşamaz
  logError(error);
}
```

### 2.2 Neden Bu Teknolojiler?

#### FastAPI (Backend)
- **WebSocket Desteği:** Native async/await ile real-time connections
- **Hız:** Node.js'den 2-3x daha hızlı JSON serialization
- **Tip Güvenliği:** Pydantic ile runtime validation
- **Otomatik Dokümantasyon:** /docs endpoint'i ile instant API explorer

#### Dexie.js (IndexedDB Wrapper)
- **Promise API:** Async/await ile modern JavaScript uyumu
- **React Integration:** Hooks desteği (`useLiveQuery`)
- **Migration Support:** Veritabanı şema değişikliklerinde otomatik migrasyon
- **Minimum Overhead:** Vanilla IndexedDB'nin üzerine sadece 20KB

#### Leaflet.js (Mapping)
- **Offline Tiles:** Harita karoları cache'lenebilir
- **Lightweight:** Google Maps API'dan 10x daha küçük bundle
- **Plugin Ecosystem:** Heatmap, cluster, routing plugins

#### WebSockets (Sync Layer)
- **Bidirectional:** Hem client→server hem server→client push
- **Low Latency:** HTTP polling'den 1000x daha az gecikme
- **Automatic Reconnection:** Bağlantı koptuğunda otomatik yeniden bağlanma

---

## 3. Ağ Topolojisi ve Altyapı

### 3.1 Network Architecture
┌─────────────────────────────────────────────────────────┐
│                    INTERNET                             │
│                 (Sadece ilk veri çekme)                 │
└────────────────────┬────────────────────────────────────┘
│
│ AFAD/Kandilli API
↓
┌──────────────────────┐
│   Master Node        │
│   (x.x.x.1)          │
│                      │
│  - FastAPI Server    │
│  - SQLite DB         │
│  - Gemini AI         │
│  - WebSocket Hub     │
│  - WiFi Hotspot      │
└──────────┬───────────┘
│
Local Area Network (192.168.1.x)
│
┌─────────────┼─────────────┐
│             │             │
↓             ↓             ↓
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Device1 │  │ Device2 │  │ Device3 │
│ x.x.x.2 │  │ x.x.x.3 │  │ x.x.x.4 │
│         │  │         │  │         │
│ PWA     │  │ PWA     │  │ PWA     │
│ Dexie   │  │ Dexie   │  │ Dexie   │
└─────────┘  └─────────┘  └─────────┘

### 3.2 IP Adresleme Şeması

| Cihaz Tipi | IP Aralığı | Amaç |
|------------|-----------|------|
| Master Node | 192.168.1.1 | Ana sunucu ve WiFi access point |
| Admin Dashboard | 192.168.1.2-10 | Komuta kontrol istasyonları |
| Field Devices | 192.168.1.11-254 | Saha ekiplerinin mobil cihazları |

### 3.3 Network Configuration

```yaml
# Master Node WiFi Hotspot Config
SSID: "TRIAGE-AFET-NOKTA-[ID]"
Password: "AFET2024-[RANDOM]"
Channel: 6 (2.4GHz - Maximum compatibility)
DHCP Range: 192.168.1.11 - 192.168.1.254
DNS: 192.168.1.1 (Local only)
Firewall: Block all external, allow LAN
```

### 3.4 Bağlantı Senaryoları

#### Senaryo A: Normal Operasyon
Device ─[WiFi]→ Master Node ─[WebSocket]→ Live Sync

#### Senaryo B: Kapsama Alanı Dışı
Device ─[Offline]→ Local Dexie DB → Queue for sync

#### Senaryo C: Dönüş ve Senkronizasyon
Device enters WiFi range
↓
Auto-connect to Master Node
↓
WebSocket handshake
↓
Push local changes (delta sync)
↓
Pull server updates
↓
Merge conflicts (timestamp-based)
↓
Update local DB
↓
Notify user of sync status

---

## 4. Teknoloji Stack Detayları

### 4.1 Frontend Stack

```json
{
  "framework": "React 18.3+",
  "buildTool": "Vite 5+",
  "styling": "TailwindCSS 3.4+",
  "stateManagement": "Zustand / Jotai",
  "routing": "React Router v6",
  "localDB": "Dexie.js 4+",
  "maps": "Leaflet.js 1.9+",
  "httpClient": "Axios",
  "websocket": "Socket.io-client",
  "pwa": "Vite PWA Plugin",
  "icons": "Lucide React",
  "charts": "Recharts (optional for analytics)"
}
```

#### 4.1.1 Neden Zustand/Jotai?
- **Redux yerine:** 10x daha az boilerplate
- **Context API yerine:** Re-render optimizasyonu
- **Persist desteği:** LocalStorage ile auto-sync

```javascript
// Zustand store örneği
import create from 'zustand';
import { persist } from 'zustand/middleware';

export const useTaskStore = create(
  persist(
    (set, get) => ({
      tasks: [],
      activeTask: null,
      
      setActiveTask: (task) => set({ activeTask: task }),
      
      completeTask: async (taskId, status) => {
        // Optimistic update
        set(state => ({
          tasks: state.tasks.map(t => 
            t.id === taskId ? { ...t, status } : t
          )
        }));
        
        // Persist to Dexie
        await db.tasks.update(taskId, { status });
        
        // Queue for server sync
        syncQueue.add({ taskId, status });
      }
    }),
    { name: 'triage-tasks' }
  )
);
```

### 4.2 Backend Stack

```python
# requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.30.0
websockets==12.0
pydantic==2.9.0
sqlalchemy==2.0.35
aiosqlite==0.20.0
python-multipart==0.0.9
google-generativeai==0.8.0  # Gemini API
python-jose[cryptography]==3.3.0  # JWT tokens
passlib[bcrypt]==1.7.4  # Password hashing
httpx==0.27.0  # Async HTTP client
python-dotenv==1.0.0
```

#### 4.2.1 FastAPI App Structure

```python
# main.py
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB, load AI model, start sync worker
    await init_database()
    await init_ai_engine()
    start_background_tasks()
    
    yield
    
    # Shutdown: Close connections, save state
    await close_database()
    await shutdown_websockets()

app = FastAPI(lifespan=lifespan)

# CORS for local network
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # LAN only, no internet
    allow_methods=["*"],
    allow_headers=["*"]
)

# WebSocket manager
from managers.websocket import ConnectionManager
ws_manager = ConnectionManager()

@app.websocket("/ws/{device_id}")
async def websocket_endpoint(websocket: WebSocket, device_id: str):
    await ws_manager.connect(websocket, device_id)
    try:
        while True:
            data = await websocket.receive_json()
            await handle_device_message(device_id, data)
    except WebSocketDisconnect:
        ws_manager.disconnect(device_id)
```

### 4.3 Database Stack

#### 4.3.1 Master Node: SQLite
```python
# models.py
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Team(Base):
    __tablename__ = "teams"
    
    id = Column(Integer, primary_key=True)
    device_ip = Column(String(15), unique=True)
    device_id = Column(String(50), unique=True)
    name = Column(String(100))
    status = Column(String(20))  # idle, busy, offline
    last_seen = Column(DateTime, default=datetime.utcnow)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    
class Zone(Base):
    __tablename__ = "zones"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(200))
    priority_score = Column(Float)  # 1.0-5.0 (AI generated)
    geometry = Column(JSON)  # GeoJSON polygon
    estimated_casualties = Column(Integer, nullable=True)
    building_density = Column(Integer, nullable=True)
    
class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True)
    zone_id = Column(Integer)
    assigned_team_id = Column(Integer, nullable=True)
    status = Column(String(30))  # pending, assigned, in_progress, 
                                  # needs_backup, false_alarm, resolved
    priority = Column(String(10))  # RED, YELLOW, GREEN
    lat = Column(Float)
    lng = Column(Float)
    address = Column(String(300))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, 
                       onupdate=datetime.utcnow)
    local_updated_at = Column(DateTime)  # Client timestamp for conflict resolution
    notes = Column(String(500), nullable=True)
```

#### 4.3.2 Field Devices: Dexie.js (IndexedDB)

```javascript
// src/services/localDb.js
import Dexie from 'dexie';

export const db = new Dexie('TriageDB');

db.version(1).stores({
  tasks: 'id, zone_id, assigned_team_id, status, priority, updated_at',
  teams: 'id, device_id, status',
  zones: 'id, priority_score',
  syncQueue: '++id, timestamp, synced',  // Outbox pattern
  settings: 'key'
});

// Sync Queue Entry
export async function queueForSync(collection, operation, data) {
  await db.syncQueue.add({
    collection,
    operation,  // 'create', 'update', 'delete'
    data,
    timestamp: Date.now(),
    synced: false
  });
}

// Example: Update task offline
export async function updateTaskLocal(taskId, updates) {
  const timestamp = Date.now();
  
  // Update local DB
  await db.tasks.update(taskId, {
    ...updates,
    local_updated_at: timestamp
  });
  
  // Queue for server sync
  await queueForSync('tasks', 'update', {
    id: taskId,
    ...updates,
    local_updated_at: timestamp
  });
}
```

---

## 5. Veritabanı Mimarisi

### 5.1 Complete Schema

```sql
-- Teams Table
CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_ip TEXT UNIQUE NOT NULL,
    device_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'offline',  -- offline, idle, busy
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    current_lat REAL,
    current_lng REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zones Table (AI prioritized regions)
CREATE TABLE zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    priority_score REAL NOT NULL,  -- 1.0 (low) to 5.0 (critical)
    geometry TEXT NOT NULL,  -- GeoJSON polygon
    estimated_casualties INTEGER,
    building_density INTEGER,
    population_density INTEGER,
    infrastructure_risk REAL,  -- AI calculated
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks Table (Core entity)
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id INTEGER NOT NULL,
    assigned_team_id INTEGER,
    status TEXT DEFAULT 'pending',
    priority TEXT NOT NULL,  -- RED, YELLOW, GREEN
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    address TEXT,
    building_type TEXT,  -- residential, commercial, public
    reported_damage_level TEXT,  -- minor, moderate, severe, collapsed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    local_updated_at TIMESTAMP,  -- From client, for conflict resolution
    assigned_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT,
    
    FOREIGN KEY (zone_id) REFERENCES zones (id),
    FOREIGN KEY (assigned_team_id) REFERENCES teams (id)
);

-- Task Status History (Audit log)
CREATE TABLE task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by_team_id INTEGER,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    
    FOREIGN KEY (task_id) REFERENCES tasks (id),
    FOREIGN KEY (changed_by_team_id) REFERENCES teams (id)
);

-- Sync Log (Device synchronization tracking)
CREATE TABLE sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    sync_type TEXT,  -- 'push', 'pull', 'conflict'
    entity_type TEXT,  -- 'task', 'team', 'zone'
    entity_id INTEGER,
    data_snapshot TEXT,  -- JSON
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Events (AFAD API calls, AI runs, errors)
CREATE TABLE system_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,  -- 'api_fetch', 'ai_analysis', 'error'
    description TEXT,
    metadata TEXT,  -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_assigned_team ON tasks(assigned_team_id);
CREATE INDEX idx_tasks_zone ON tasks(zone_id);
CREATE INDEX idx_teams_status ON teams(status);
CREATE INDEX idx_sync_log_device ON sync_log(device_id, synced_at);
```

### 5.2 Data Flow Diagram
┌─────────────────────────────────────────────────────────────┐
│                    DATA LIFECYCLE                           │
└─────────────────────────────────────────────────────────────┘

INITIAL DATA INGESTION
[AFAD API] → [Master SQLite] → [AI Processing] → [Zone Priority Scores]
TASK CREATION
[AI Engine] → [Generate Tasks] → [Master SQLite.tasks]
TASK DISTRIBUTION
[Master SQLite] → [WebSocket Broadcast] → [All Connected Devices]
LOCAL SYNC (Device connects)
[Device Dexie] ← [WebSocket Pull] ← [Master SQLite]
OFFLINE OPERATION
[User Action] → [Device Dexie UPDATE] → [Sync Queue]
RECONNECTION SYNC
[Device Dexie.syncQueue] → [WebSocket Push] → [Master SQLite]
CONFLICT RESOLUTION
IF (server.updated_at > client.local_updated_at)
THEN server wins
ELSE IF (client.local_updated_at > server.updated_at)
THEN client wins
ELSE
LOG conflict for manual review


---

## 6. API Katmanı ve Endpoint Tasarımı

### 6.1 REST API Endpoints

#### 6.1.1 Authentication & Registration

```python
# POST /api/v1/auth/register-device
{
  "device_id": "DEVICE-ABC-123",
  "device_name": "Ekip Alfa 1",
  "device_type": "field_mobile"  # or "admin_desktop"
}
Response: {
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbG...",
  "device_ip": "192.168.1.15",
  "role": "field_worker"
}

# POST /api/v1/auth/heartbeat
{
  "device_id": "DEVICE-ABC-123",
  "lat": 38.4192,
  "lng": 27.1287,
  "battery_level": 75
}
Response: {
  "status": "ok",
  "new_tasks_count": 2
}
```

#### 6.1.2 Task Management

```python
# GET /api/v1/tasks
Query params: ?status=pending&priority=RED&limit=50
Response: {
  "tasks": [
    {
      "id": 42,
      "zone_id": 5,
      "priority": "RED",
      "lat": 38.4192,
      "lng": 27.1287,
      "address": "Bornova, 3. Sokak No:15",
      "status": "pending",
      "estimated_casualties": 8
    }
  ],
  "total": 127
}

# PATCH /api/v1/tasks/{task_id}
{
  "status": "false_alarm",
  "notes": "Bina hasar görmemiş",
  "local_updated_at": 1704123456789
}
Response: {
  "id": 42,
  "status": "false_alarm",
  "updated_at": "2024-01-01T12:34:56Z"
}

# POST /api/v1/tasks/{task_id}/request-backup
{
  "reason": "heavy_damage",
  "additional_teams_needed": 2
}
Response: {
  "backup_request_id": 15,
  "status": "pending",
  "eta_minutes": null
}
```

#### 6.1.3 Team/Device Management

```python
# GET /api/v1/teams
Response: {
  "teams": [
    {
      "id": 1,
      "name": "Ekip Alfa 1",
      "status": "busy",
      "current_task_id": 42,
      "lat": 38.4192,
      "lng": 27.1287,
      "last_seen": "2024-01-01T12:34:56Z"
    }
  ]
}

# PATCH /api/v1/teams/{team_id}/status
{
  "status": "idle"  # or "busy", "offline"
}
```

#### 6.1.4 Zone & Analytics

```python
# GET /api/v1/zones
Response: {
  "zones": [
    {
      "id": 5,
      "name": "Bornova Merkez",
      "priority_score": 4.8,
      "geometry": {...},  # GeoJSON
      "pending_tasks": 23,
      "completed_tasks": 5
    }
  ]
}

# GET /api/v1/analytics/dashboard
Response: {
  "total_tasks": 450,
  "completed": 89,
  "in_progress": 34,
  "pending": 327,
  "active_teams": 12,
  "idle_teams": 3,
  "average_completion_time_minutes": 28,
  "zones_by_priority": {
    "critical": 5,
    "high": 12,
    "medium": 18
  }
}
```

#### 6.1.5 External Data Integration

```python
# POST /api/v1/admin/fetch-afad-data
{
  "earthquake_id": "20240101-123456",
  "force_refresh": false
}
Response: {
  "status": "processing",
  "job_id": "job-789",
  "estimated_completion_seconds": 30
}

# POST /api/v1/admin/run-ai-analysis
{
  "zone_ids": [1, 2, 3],  # Empty array = all zones
  "force_rerun": false
}
Response: {
  "status": "queued",
  "analysis_id": "analysis-456"
}
```

### 6.2 WebSocket Protocol

```javascript
// Client → Server Messages

{
  "type": "SYNC_REQUEST",
  "device_id": "DEVICE-ABC-123",
  "last_sync_timestamp": 1704123456789,
  "pending_changes": [
    {
      "entity": "task",
      "id": 42,
      "operation": "update",
      "data": {
        "status": "false_alarm",
        "local_updated_at": 1704123456789
      }
    }
  ]
}

{
  "type": "LOCATION_UPDATE",
  "device_id": "DEVICE-ABC-123",
  "lat": 38.4192,
  "lng": 27.1287,
  "timestamp": 1704123456789
}

// Server → Client Messages

{
  "type": "SYNC_RESPONSE",
  "timestamp": 1704123500000,
  "changes": [
    {
      "entity": "task",
      "operation": "create",
      "data": {
        "id": 99,
        "priority": "RED",
        "lat": 38.5,
        "lng": 27.2,
        ...
      }
    }
  ],
  "conflicts": []  # Will be discussed in conflict resolution
}

{
  "type": "NEW_TASK_ASSIGNMENT",
  "task_id": 99,
  "priority": "RED",
  "message": "Yeni acil görev atandı"
}

{
  "type": "BROADCAST",
  "message": "Sistem güncellendi. Yeni veri çekildi."
}
```

---

## 7. Frontend Mimarisi

### 7.1 Component Structure
src/
├── components/
│   ├── common/
│   │   ├── Button.jsx
│   │   ├── LoadingSpinner.jsx
│   │   ├── ConnectionStatus.jsx
│   │   └── ErrorBoundary.jsx
│   │
│   ├── map/
│   │   ├── BaseMap.jsx
│   │   ├── TaskMarker.jsx
│   │   ├── ZonePolygon.jsx
│   │   ├── TeamMarker.jsx
│   │   └── HeatmapLayer.jsx
│   │
│   ├── admin/
│   │   ├── Dashboard.jsx
│   │   ├── TeamList.jsx
│   │   ├── TaskQueue.jsx
│   │   ├── ZoneManager.jsx
│   │   ├── Analytics.jsx
│   │   └── SystemLogs.jsx
│   │
│   └── field/
│       ├── ActiveTaskCard.jsx
│       ├── ActionButtons.jsx
│       ├── NavigationMap.jsx
│       └── OfflineIndicator.jsx
│
├── pages/
│   ├── AdminDashboard.jsx
│   ├── MobileFieldApp.jsx
│   └── Login.jsx
│
├── services/
│   ├── localDb.js          # Dexie configuration
│   ├── syncQueue.js        # Offline sync queue manager
│   ├── websocket.js        # WebSocket connection handler
│   ├── api.js              # REST API client
│   └── geolocation.js      # Device location tracking
│
├── stores/
│   ├── taskStore.js        # Zustand: Task state
│   ├── teamStore.js        # Zustand: Team state
│   ├── uiStore.js          # Zustand: UI state (modals, etc.)
│   └── syncStore.js        # Zustand: Sync status
│
├── hooks/
│   ├── useOnlineStatus.js
│   ├── useSyncStatus.js
│   ├── useGeolocation.js
│   └── useTaskOperations.js
│
├── utils/
│   ├── conflictResolver.js
│   ├── dateFormatter.js
│   └── validators.js
│
└── App.jsx

### 7.2 Key Components Implementation

#### 7.2.1 Admin Dashboard

```jsx
// src/pages/AdminDashboard.jsx
import React, { useEffect } from 'react';
import { BaseMap } from '../components/map/BaseMap';
import { TeamList } from '../components/admin/TeamList';
import { TaskQueue } from '../components/admin/TaskQueue';
import { Analytics } from '../components/admin/Analytics';
import { useTaskStore } from '../stores/taskStore';
import { useTeamStore } from '../stores/teamStore';

export function AdminDashboard() {
  const { tasks, fetchTasks } = useTaskStore();
  const { teams, fetchTeams } = useTeamStore();
  
  useEffect(() => {
    // Initial data load
    fetchTasks();
    fetchTeams();
    
    // WebSocket subscription for real-time updates
    const ws = connectWebSocket();
    ws.on('task_update', (task) => {
      // Auto-update store
      useTaskStore.getState().updateTask(task);
    });
    
    return () => ws.disconnect();
  }, []);
  
  return (
    <div className="grid grid-cols-12 h-screen bg-gray-900">
      {/* Left Sidebar: Stats & Controls */}
      <aside className="col-span-3 border-r border-gray-700 p-4">
        <Analytics />
        <div className="mt-6">
          <button className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg">
            AFAD Veri Çek
          </button>
        </div>
      </aside>
      
      {/* Main Map Area */}
      <main className="col-span-6">
        <BaseMap
          tasks={tasks}
          teams={teams}
          showZones={true}
          showHeatmap={true}
        />
      </main>
      
      {/* Right Sidebar: Teams & Tasks */}
      <aside className="col-span-3 border-l border-gray-700 overflow-y-auto">
        <TeamList teams={teams} />
        <TaskQueue tasks={tasks.filter(t => t.status === 'pending')} />
      </aside>
    </div>
  );
}
```

#### 7.2.2 Mobile Field App

```jsx
// src/pages/MobileFieldApp.jsx
import React, { useState, useEffect } from 'react';
import { NavigationMap } from '../components/field/NavigationMap';
import { ActiveTaskCard } from '../components/field/ActiveTaskCard';
import { ActionButtons } from '../components/field/ActionButtons';
import { OfflineIndicator } from '../components/field/OfflineIndicator';
import { useTaskStore } from '../stores/taskStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function MobileFieldApp() {
  const isOnline = useOnlineStatus();
  const { activeTask, completeTask, requestBackup, cancelTask } = useTaskStore();
  
  if (!activeTask) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-3xl mb-4">Görev Bekleniyor</h1>
          <p className="text-gray-400">Yeni görev atandığında bildirim alacaksınız</p>
          {!isOnline && <OfflineIndicator />}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Connection Status Bar */}
      {!isOnline && <OfflineIndicator />}
      
      {/* Active Task Info */}
      <ActiveTaskCard task={activeTask} />
      
      {/* Navigation Map */}
      <NavigationMap
        destination={{
          lat: activeTask.lat,
          lng: activeTask.lng
        }}
        className="flex-1"
      />
      
      {/* Action Buttons */}
      <ActionButtons
        onArrived={() => completeTask(activeTask.id, 'in_progress')}
        onNeedBackup={() => requestBackup(activeTask.id)}
        onNoDamage={() => cancelTask(activeTask.id, 'false_alarm')}
      />
    </div>
  );
}
```

#### 7.2.3 Action Buttons Component

```jsx
// src/components/field/ActionButtons.jsx
import React from 'react';

export function ActionButtons({ onArrived, onNeedBackup, onNoDamage }) {
  return (
    <div className="grid grid-cols-1 gap-4 p-6 bg-gray-800">
      {/* Green: Arrived */}
      <button
        onClick={onArrived}
        className="h-24 bg-green-600 hover:bg-green-700 active:bg-green-800
                   text-white text-2xl font-bold rounded-xl
                   shadow-lg active:shadow-inner
                   transition-all duration-150"
      >
        🟢 BÖLGEYE ULAŞILDI
      </button>
      
      {/* Red: Need Backup */}
      <button
        onClick={onNeedBackup}
        className="h-24 bg-red-600 hover:bg-red-700 active:bg-red-800
                   text-white text-2xl font-bold rounded-xl
                   shadow-lg active:shadow-inner
                   transition-all duration-150"
      >
        🔴 DESTEK EKİP LAZIM
      </button>
      
      {/* Gray: No Damage */}
      <button
        onClick={onNoDamage}
        className="h-20 bg-gray-600 hover:bg-gray-700 active:bg-gray-800
                   text-white text-xl font-bold rounded-xl
                   shadow-lg active:shadow-inner
                   transition-all duration-150"
      >
        ⚪ HASAR YOK / GÖREVİ İPTAL ET
      </button>
    </div>
  );
}
```

---

## 8. Offline-First Mimari ve Senkronizasyon Stratejisi

### 8.1 Sync Queue Implementation

```javascript
// src/services/syncQueue.js
import { db } from './localDb';
import { api } from './api';

class SyncQueue {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
  }
  
  // Add operation to queue
  async add(operation) {
    await db.syncQueue.add({
      ...operation,
      timestamp: Date.now(),
      synced: false,
      retries: 0
    });
    
    // Try immediate sync if online
    if (navigator.onLine) {
      this.processQueue();
    }
  }
  
  // Process all pending operations
  async processQueue() {
    if (this.isSyncing) return;
    
    this.isSyncing = true;
    const pending = await db.syncQueue
      .where('synced').equals(false)
      .sortBy('timestamp');
    
    for (const operation of pending) {
      try {
        await this.syncOperation(operation);
        await db.syncQueue.update(operation.id, { synced: true });
      } catch (error) {
        // Increment retry count
        await db.syncQueue.update(operation.id, {
          retries: operation.retries + 1,
          last_error: error.message
        });
        
        // Give up after 5 retries
        if (operation.retries >= 5) {
          console.error('Sync failed after 5 retries:', operation);
          await db.syncQueue.update(operation.id, {
            synced: true,  // Mark as processed (failed)
            failed: true
          });
        }
      }
    }
    
    this.isSyncing = false;
  }
  
  async syncOperation(operation) {
    const { collection, operation: op, data } = operation;
    
    switch (collection) {
      case 'tasks':
        if (op === 'update') {
          return await api.patch(`/tasks/${data.id}`, data);
        }
        break;
        
      case 'teams':
        if (op === 'update') {
          return await api.patch(`/teams/${data.id}`, data);
        }
        break;
    }
  }
  
  // Start background sync worker
  startAutoSync(intervalMs = 30000) {  // 30 seconds
    this.syncInterval = setInterval(() => {
      if (navigator.onLine) {
        this.processQueue();
      }
    }, intervalMs);
  }
  
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

export const syncQueue = new SyncQueue();
```

### 8.2 WebSocket Manager

```javascript
// src/services/websocket.js
import io from 'socket.io-client';
import { db } from './localDb';
import { syncQueue } from './syncQueue';

class WebSocketManager {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }
  
  connect(deviceId) {
    const serverUrl = `ws://192.168.1.1:8000`;
    
    this.socket = io(serverUrl, {
      query: { device_id: deviceId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Trigger sync on reconnection
      this.performFullSync();
    });
    
    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
    
    this.socket.on('sync_response', async (data) => {
      await this.handleSyncResponse(data);
    });
    
    this.socket.on('new_task_assignment', async (task) => {
      await db.tasks.put(task);
      // Trigger UI notification
      this.notifyNewTask(task);
    });
    
    this.socket.on('task_update', async (task) => {
      await db.tasks.update(task.id, task);
    });
  }
  
  async performFullSync() {
    // 1. Push local changes
    const localChanges = await db.syncQueue
      .where('synced').equals(false)
      .toArray();
    
    if (localChanges.length > 0) {
      this.socket.emit('sync_request', {
        pending_changes: localChanges.map(c => ({
          entity: c.collection,
          id: c.data.id,
          operation: c.operation,
          data: c.data
        }))
      });
    }
    
    // 2. Pull server updates
    const lastSyncTime = await db.settings.get('last_sync_timestamp');
    this.socket.emit('pull_updates', {
      since: lastSyncTime || 0
    });
  }
  
  async handleSyncResponse(data) {
    const { changes, conflicts } = data;
    
    // Apply changes
    for (const change of changes) {
      switch (change.entity) {
        case 'task':
          if (change.operation === 'create') {
            await db.tasks.add(change.data);
          } else if (change.operation === 'update') {
            await db.tasks.update(change.data.id, change.data);
          }
          break;
      }
    }
    
    // Handle conflicts (if any)
    if (conflicts.length > 0) {
      await this.resolveConflicts(conflicts);
    }
    
    // Update last sync timestamp
    await db.settings.put({
      key: 'last_sync_timestamp',
      value: Date.now()
    });
  }
  
  async resolveConflicts(conflicts) {
    // Simple strategy: server wins for now
    // TODO: Implement more sophisticated conflict resolution
    for (const conflict of conflicts) {
      await db.tasks.update(conflict.id, conflict.server_data);
    }
  }
  
  notifyNewTask(task) {
    // Browser notification if supported
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Yeni Görev!', {
        body: `${task.priority} öncelikli görev: ${task.address}`,
        icon: '/icon-192x192.png'
      });
    }
    
    // Also vibrate if supported (mobile)
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export const wsManager = new WebSocketManager();
```

### 8.3 Conflict Resolution Strategy

```javascript
// src/utils/conflictResolver.js

export function resolveTaskConflict(localTask, serverTask) {
  // Strategy 1: Timestamp comparison
  const localTime = localTask.local_updated_at || localTask.updated_at;
  const serverTime = serverTask.updated_at;
  
  if (localTime > serverTime) {
    // Local is newer → local wins
    return {
      winner: 'local',
      data: localTask
    };
  } else if (serverTime > localTime) {
    // Server is newer → server wins
    return {
      winner: 'server',
      data: serverTask
    };
  }
  
  // Strategy 2: Status priority (if timestamps are equal)
  const statusPriority = {
    'resolved': 5,
    'needs_backup': 4,
    'false_alarm': 4,
    'in_progress': 3,
    'assigned': 2,
    'pending': 1
  };
  
  const localPriority = statusPriority[localTask.status] || 0;
  const serverPriority = statusPriority[serverTask.status] || 0;
  
  if (localPriority > serverPriority) {
    return { winner: 'local', data: localTask };
  } else if (serverPriority > localPriority) {
    return { winner: 'server', data: serverTask };
  }
  
  // Strategy 3: Manual review needed
  return {
    winner: 'conflict',
    data: null,
    requiresManualReview: true,
    localData: localTask,
    serverData: serverTask
  };
}
```

---

## 9. AI Entegrasyonu ve Önceliklendirme Algoritması

### 9.1 Gemini AI Service

```python
# backend/services/ai_engine.py
import google.generativeai as genai
from typing import List, Dict
import json

class AIEngine:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-pro')
    
    async def analyze_earthquake_data(self, earthquake_data: Dict) -> List[Dict]:
        """
        Deprem verisini analiz eder ve bölgeleri önceliklendirir.
        
        Args:
            earthquake_data: {
                'magnitude': 7.8,
                'epicenter': {'lat': 38.0, 'lng': 37.0},
                'depth_km': 10,
                'affected_regions': [
                    {
                        'name': 'Bornova',
                        'population': 450000,
                        'building_count': 85000,
                        'old_building_ratio': 0.65,
                        'distance_to_epicenter_km': 45
                    }
                ]
            }
        
        Returns:
            List of zones with priority scores
        """
        
        prompt = f"""
Sen bir afet yönetim yapay zekasısın. Aşağıdaki deprem verisine göre 
bölgeleri önceliklendir ve her birine 1.0-5.0 arası risk skoru ver.

Deprem Bilgisi:
- Büyüklük: {earthquake_data['magnitude']}
- Derinlik: {earthquake_data['depth_km']} km
- Episantr: {earthquake_data['epicenter']}

Bölgeler:
{json.dumps(earthquake_data['affected_regions'], indent=2, ensure_ascii=False)}

Önceliklendirme Kriterleri:
1. Episantra yakınlık (0-30 km = kritik)
2. Eski bina oranı (>50% = yüksek risk)
3. Nüfus yoğunluğu (>100k = öncelikli)
4. Deprem büyüklüğü ile mesafe korelasyonu

JSON formatında döndür:
{{
  "zones": [
    {{
      "name": "Bölge Adı",
      "priority_score": 4.8,
      "reasoning": "Episantra 12km, eski bina oranı %75",
      "estimated_casualties": 150,
      "recommended_team_count": 5
    }}
  ]
}}
"""
        
        response = await self.model.generate_content_async(prompt)
        result = json.loads(response.text)
        return result['zones']
    
    async def prioritize_building(self, building_data: Dict) -> float:
        """
        Tek bir binayı önceliklendir.
        
        Args:
            building_data: {
                'address': 'Bornova 3. Sokak No:15',
                'building_age': 45,
                'floors': 5,
                'building_type': 'residential',
                'proximity_to_epicenter_km': 12,
                'soil_type': 'soft',  # soft, medium, hard
                'reported_damage': 'moderate'  # minor, moderate, severe, collapsed
            }
        
        Returns:
            Priority score (1.0 - 5.0)
        """
        
        # Basit kural tabanlı sistem (AI olmadan hızlı hesaplama için)
        score = 1.0
        
        # Mesafe skoru
        if building_data['proximity_to_epicenter_km'] < 10:
            score += 2.0
        elif building_data['proximity_to_epicenter_km'] < 30:
            score += 1.5
        elif building_data['proximity_to_epicenter_km'] < 50:
            score += 1.0
        
        # Bina yaşı skoru
        if building_data['building_age'] > 50:
            score += 1.5
        elif building_data['building_age'] > 30:
            score += 1.0
        
        # Hasar raporu skoru
        damage_scores = {
            'collapsed': 5.0,
            'severe': 4.0,
            'moderate': 2.5,
            'minor': 1.0
        }
        score = max(score, damage_scores.get(building_data['reported_damage'], 1.0))
        
        # Zemin tipi çarpanı
        soil_multipliers = {
            'soft': 1.3,
            'medium': 1.1,
            'hard': 1.0
        }
        score *= soil_multipliers.get(building_data['soil_type'], 1.0)
        
        # 1.0-5.0 aralığına normalize et
        return min(5.0, max(1.0, score))
```

### 9.2 Task Generation from AI Analysis

```python
# backend/services/task_generator.py
from models import Zone, Task
from database import db_session
from datetime import datetime

class TaskGenerator:
    def __init__(self, ai_engine):
        self.ai_engine = ai_engine
    
    async def generate_tasks_from_zones(self, zones: List[Dict]):
        """
        AI analiz sonuçlarından görev listesi oluşturur.
        """
        tasks = []
        
        for zone_data in zones:
            # Zone kaydı oluştur
            zone = Zone(
                name=zone_data['name'],
                priority_score=zone_data['priority_score'],
                estimated_casualties=zone_data.get('estimated_casualties', 0),
                geometry=zone_data.get('geometry', {}),
                created_at=datetime.utcnow()
            )
            db_session.add(zone)
            db_session.flush()  # ID almak için
            
            # Her bölge için birden fazla görev oluştur
            task_count = zone_data.get('recommended_team_count', 3)
            
            for i in range(task_count):
                # Bölge içinde rastgele koordinat oluştur
                # (Gerçek uygulamada bina veritabanından çekilecek)
                task = Task(
                    zone_id=zone.id,
                    priority='RED' if zone.priority_score >= 4.0 else
                           'YELLOW' if zone.priority_score >= 2.5 else 'GREEN',
                    status='pending',
                    lat=zone_data.get('center_lat'),
                    lng=zone_data.get('center_lng'),
                    address=f"{zone.name} - Görev {i+1}",
                    created_at=datetime.utcnow()
                )
                tasks.append(task)
                db_session.add(task)
        
        db_session.commit()
        return tasks
```

---

## 10. Güvenlik ve Hata Yönetimi

### 10.1 Authentication & Authorization

```python
# backend/security/auth.py
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta

SECRET_KEY = "YOUR-SECRET-KEY-CHANGE-IN-PRODUCTION"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

# Middleware
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

security = HTTPBearer()

async def get_current_device(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    payload = verify_token(token)
    
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    device_id = payload.get("device_id")
    if device_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    
    return device_id
```

### 10.2 Error Handling Patterns

```python
# backend/errors/handlers.py
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "validation_error",
            "details": exc.errors()
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the error
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "internal_server_error",
            "message": "Bir hata oluştu. Lütfen daha sonra tekrar deneyin."
        }
    )
```

```javascript
// frontend/src/utils/errorHandler.js
export class AppError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function handleError(error) {
  // Network error
  if (!navigator.onLine) {
    return {
      type: 'offline',
      message: 'İnternet bağlantısı yok. Değişiklikler kaydedildi, bağlantı gelince senkronize edilecek.'
    };
  }
  
  // API error
  if (error.response) {
    const { status, data } = error.response;
    
    if (status === 401) {
      // Token expired → logout
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
      return null;
    }
    
    if (status === 403) {
      return {
        type: 'permission',
        message: 'Bu işlemi yapmaya yetkiniz yok.'
      };
    }
    
    return {
      type: 'api_error',
      message: data.message || 'Bir hata oluştu.'
    };
  }
  
  // Unknown error
  return {
    type: 'unknown',
    message: 'Beklenmeyen bir hata oluştu.'
  };
}
```

### 10.3 Data Validation

```python
# backend/schemas/task.py
from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional

class TaskUpdate(BaseModel):
    status: str = Field(..., regex='^(pending|assigned|in_progress|needs_backup|false_alarm|resolved)$')
    notes: Optional[str] = Field(None, max_length=500)
    local_updated_at: int  # Unix timestamp
    
    @validator('local_updated_at')
    def validate_timestamp(cls, v):
        # Check if timestamp is reasonable (not too far in past/future)
        now = datetime.utcnow().timestamp() * 1000
        if abs(now - v) > 86400000 * 7:  # 7 days
            raise ValueError('Timestamp too far from current time')
        return v
```

---

## 11. Proje Klasör Yapısı
triage-v2/
├── backend/
│   ├── main.py                    # FastAPI entry point
│   ├── config.py                  # Environment variables
│   ├── database.py                # SQLAlchemy setup
│   │
│   ├── models/
│   │   ├── init.py
│   │   ├── team.py
│   │   ├── zone.py
│   │   ├── task.py
│   │   └── system_event.py
│   │
│   ├── schemas/
│   │   ├── init.py
│   │   ├── team.py               # Pydantic models for API
│   │   ├── zone.py
│   │   └── task.py
│   │
│   ├── routes/
│   │   ├── init.py
│   │   ├── auth.py               # /api/v1/auth/*
│   │   ├── tasks.py              # /api/v1/tasks/*
│   │   ├── teams.py              # /api/v1/teams/*
│   │   ├── zones.py              # /api/v1/zones/*
│   │   ├── admin.py              # /api/v1/admin/*
│   │   └── websocket.py          # WebSocket endpoints
│   │
│   ├── services/
│   │   ├── init.py
│   │   ├── ai_engine.py          # Gemini AI integration
│   │   ├── task_generator.py     # Auto task creation
│   │   ├── afad_client.py        # AFAD API client
│   │   └── sync_service.py       # Device sync logic
│   │
│   ├── managers/
│   │   ├── init.py
│   │   └── websocket_manager.py  # WebSocket connection pool
│   │
│   ├── security/
│   │   ├── init.py
│   │   └── auth.py               # JWT, password hashing
│   │
│   ├── errors/
│   │   ├── init.py
│   │   └── handlers.py           # Global error handlers
│   │
│   ├── utils/
│   │   ├── init.py
│   │   ├── logger.py
│   │   └── validators.py
│   │
│   ├── tests/
│   │   ├── test_api.py
│   │   ├── test_sync.py
│   │   └── test_ai.py
│   │
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── admin/                     # Komuta Merkezi (Ayrı Vite+React+TS uygulaması)
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── index.css
│   │   │   ├── types.ts
│   │   │   ├── components/
│   │   │   │   ├── MapPanel.tsx
│   │   │   │   ├── CommandSidePanel.tsx
│   │   │   │   └── IntelligenceLogPanel.tsx
│   │   │   ├── services/          # (Phase 4'te eklenecek)
│   │   │   ├── stores/            # (Phase 4'te eklenecek)
│   │   │   └── hooks/             # (Phase 4'te eklenecek)
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   └── field/                     # Saha Uygulaması (Ayrı Vite+React+TS PWA)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── index.css
│       │   ├── components/
│       │   │   ├── StatusBar.tsx
│       │   │   ├── TaskMap.tsx
│       │   │   └── SwipeButton.tsx
│       │   ├── lib/
│       │   │   └── db.ts          # Dexie.js setup
│       │   ├── services/          # (Phase 4'te eklenecek)
│       │   ├── stores/            # (Phase 4'te eklenecek)
│       │   └── hooks/             # (Phase 4'te eklenecek)
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
│
├── docs/
│   ├── ARCHITECTURE.md            # Bu dosya
│   ├── API.md                     # API documentation
│   ├── DEPLOYMENT.md              # Deployment guide
│   └── USER_GUIDE.md              # User manual
│
├── scripts/
│   ├── init_db.py                 # Database initialization
│   ├── seed_data.py               # Test data seeder
│   └── deploy.sh                  # Bare-metal deployment script
│
├── ~~docker-compose.yml~~         # [DEPRECATED] Bare-metal deployment kullanılıyor
├── .gitignore
├── README.md
└── LICENSE

---

## 12. Geliştirme Aşamaları ve Roadmap

### PHASE 1: Temel Altyapı (Sprint 1-2, 2 hafta)

#### Sprint 1.1: Backend Skeleton
- [X] FastAPI projesi kurulumu
- [X] SQLite veritabanı şema oluşturma
- [X] Basic CRUD endpoints (tasks, teams, zones)
- [X] JWT authentication
- [X] WebSocket connection manager

**Çıktı:** Backend API `/docs` üzerinden test edilebilir durumda ✅

#### Sprint 1.2: Frontend Foundation
- [X] Vite + React projesi kurulumu
- [X] TailwindCSS konfigürasyonu
- [X] Dexie.js local database setup
- [X] Basic routing (admin vs field app)
- [X] Login sayfası

**Çıktı:** Frontend başlatılabilir, login ekranı çalışıyor ✅

---

### PHASE 2: Core Features (Sprint 3-5, 3 hafta)

#### Sprint 2.1: Offline-First Architecture
- [X] IndexedDB schema implementation
- [X] Sync queue sistemi
- [X] WebSocket client integration
- [X] Online/offline detection
- [X] Basic conflict resolution

**Çıktı:** Offline mode çalışıyor, reconnect sonrası sync oluyor ✅

#### Sprint 2.2: Admin Dashboard
- [X] Leaflet harita entegrasyonu
- [X] Zone polygon rendering
- [X] Team location tracking
- [X] Task queue display
- [X] Real-time WebSocket updates

**Çıktı:** Admin dashboard operasyonel ✅

#### Sprint 2.3: Mobile Field App
- [X] Active task card
- [X] Navigation map
- [X] Action buttons (3 büyük buton)
- [X] Offline indicator
- [X] Task status update

**Çıktı:** Field app operasyonel, offline-first çalışıyor ✅

---

### PHASE 3: AI & Advanced Features (Sprint 6-7, 2 hafta)

#### Sprint 3.1: AI Integration
- [X] Gemini API integration
- [X] Zone prioritization algorithm
- [X] Task generation from AI analysis
- [X] AFAD API client (mock)

**Çıktı:** AI analiz sistemi çalışıyor ✅

#### Sprint 3.2: Dynamic Task Assignment
- [X] Auto task assignment logic
- [X] Task reassignment on cancel
- [X] Backup request workflow
- [X] Team status management

**Çıktı:** Dinamik görev dağılımı aktif ✅

---

### PHASE 4: State, Offline DB ve WebSocket Entegrasyonu (Sprint 8-9, 2 hafta)

> **[DEPRECATED] Eski yaklaşım:** HTML şablonlarını React komponentlerine çevirme.
> **Yeni yaklaşım:** Mevcut React+TS komponentlerine state management, offline DB ve WebSocket katmanlarını bağlama.

#### Sprint 4.1: Admin (Komuta) App Wiring
- [X] Zustand store entegrasyonu (taskStore, teamStore, syncStore)
- [X] REST API client servisi (api.ts)
- [X] WebSocket client servisi (websocket.ts)
- [X] MapPanel → canlı task/team verisi bağlama
- [X] CommandSidePanel → API-driven ekip yönetimi
- [X] IntelligenceLogPanel → gerçek sistem event’leri

#### Sprint 4.2: Field (Saha) App Wiring
- [X] Dexie.js offline DB şemasını backend şemasıyla hizalama
- [X] Sync queue servisi (syncQueue.ts)
- [X] WebSocket client servisi (websocket.ts)
- [X] SwipeButton aksiyonları → offline-first task status update
- [X] TaskMap → canlı görev koordinatları
- [X] StatusBar → gerçek bağlantı durumu ve sync status

**Çıktı:** Her iki frontend uygulaması backend API’ye bağlı ve offline-first çalışıyor ✅

#### Sprint 4.3: Gerçek Zamanlı Veri ve Aksiyon Entegrasyonu (Purge Mock Data & Core Wiring)
- [x] `App.tsx` içerisindeki mock veriler (`DEMO_UNITS`, `DEMO_ZONES`) temizlenecek, API'den gerçek state beslemesi (initial hydration) yapılacak.
- [x] `MapPanel.tsx`'te `react-leaflet-draw` ile Bölge Çizme (POST `/api/v1/zones`) entegrasyonu.
- [x] `MapPanel.tsx`'te Öncelik Ezme aracı ile döngüsel (RED->YELLOW->GREEN) PATCH isteği atılması ve WS broadcast tetiklenmesi.
- [x] `CommandSidePanel.tsx` veya `MapPanel.tsx` üzerinden Manuel Ekip Atama işlemlerinin backend ile entegrasyonu.
- [x] `syncQueue.ts`'nin Zone koleksiyonu işlemlerini kuyruklaması ve senkronize etmesi.
- [x] Backend `zones.py` rotalarının WS `ZONE_UPDATE` broadcast olayını tetiklemesi.
- [x] Fix Map Pointer-Events & Move Draw Controls to Top-Right.
- [x] Implement WebSocket TEAM_PRESENCE handshake.
- [x] Hotfix: Map Navigation & Leaflet Draw CSS Integration
- [x] Feature: Mobile Dynamic IP Config Storage
- [x] Hotfix: Admin UI Real-time Presence Sync
- [x] Feature: Custom Integrated Draw Toolbar UI
- [x] Hotfix: SQLite DB Team Seeding & Schema Sync
- [x] Feature: Dynamic Team Selection UI for Task Dispatch & Visual Feedback
- [x] Feature: Double-click priority escalation UX for zones and tasks in Override mode
- [x] Hotfix: Reactive UI sync for new zones via Dexie transaction.on('complete')
- [x] Hotfix: Resolve fatal React crash on Star (Priority/Override) toolbar icon click
- [x] Hotfix: Resolve Zone 404 Sync Error (Ghost Polygons) and ID mapping on Priority Override
- [x] Hotfix: Resolve missing LogType import causing ReferenceError in MapPanel.tsx
- [x] Hotfix: Resolve GeoJSON Lat/Lng coordinate inversion causing corrupted polygon renders
- [x] Feature: Native React Draw Control Sub-Panel Under PEN Button
- [x] Architecture Pivot: Dynamic Device Auto-Registration (No hardcoded teams)
- [x] Hotfix: Rebind Leaflet L.Draw.Event.CREATED to REST API post
- [x] Hotfix: Admin UI Data Fetching, Base URL, and CORS strict alignment
- [x] Feature: Dynamic Team Selection UI for Task Dispatch & Visual Feedback
- [x] Hotfix: Resolve fatal React crash on Star (Priority/Override) toolbar icon click
- [x] Feature: True Offline P2P Task Sharing via QR Codes (Generation & Camera Scanning)
- [x] Feature: Proportional Bulk Task Splitting Algorithm (Math.floor(n/2) by priority)
- [x] Feature: QR Payload Minification and One-Way Handoff Confirmation Logic
- [x] Hotfix: Filter out completed/cancelled tasks from P2P QR sharing split logic
- [x] Hotfix: Resolve global task leak by enforcing targeted WS messaging and strict frontend device ID checks
- [x] Hotfix: Standardize assigned_team_id to use String device_ids in WS payloads globally — fixes Integer PK vs String device_name mismatch causing field apps to reject their own tasks
- [x] Hotfix: Eliminate infinite Dexie.js write loops causing QuotaExceededError — deep equality checks, useEffect dep fix, QuotaExceeded auto-purge
- [x] Hotfix: Restrict QR split calculation to deduplicated unique active-state tasks only — prevents 1-to-5 ghost multiplication
- [x] Hotfix: Throttle GPS/Team location Dexie persistence to max once per 10s — prevents storage spam from geolocation API
- [x] Hotfix: Apply defensive deep-equality checks to Zone updates in WS handler — skip identical zone writes


---

### PHASE 5: Testing & Optimization (Sprint 10, 1 hafta)

#### Sprint 5.1: Testing
- [X] Unit tests (backend services)
- [X] Integration tests (API endpoints)
- [X] E2E tests (critical user flows)
- [X] Offline scenario testing
- [X] WebSocket stress testing

#### Sprint 5.2: Performance Optimization
- [X] Database query optimization
- [X] Frontend bundle size reduction
- [X] Service Worker caching strategy
- [X] WebSocket message batching
- [X] Map tile preloading

**Çıktı:** Sistem production-ready ✅

---

### PHASE 6: Deployment & Training (Sprint 11, 1 hafta)

#### Sprint 6.1: Deployment (Bare-Metal)
- [X] ~~Docker containerization~~ [DEPRECATED]
- [X] systemd service dosyaları (triage-backend.service)
- [X] Nginx konfigürasyonu (admin + field + API proxy)
- [X] Bare-metal deployment script (scripts/setup_server.sh)
- [X] WiFi hotspot configuration guide
- [X] System monitoring setup

#### Sprint 6.2: Documentation & Training
- [X] User manual (Türkçe)
- [X] Admin training materials
- [X] Field worker quick guide
- [X] Troubleshooting guide

**Çıktı:** Sistem deploy edildi, kullanıcılar eğitildi ✅

---

## 13. Frontend Entegrasyon Planı (Güncellenmiş)

> **[DEPRECATED] Eski yaklaşım:** `frontend_sablon_tasarim` klasöründeki HTML şablonları JSX'e çevirme.
> **Yeni yaklaşım:** Mevcut Vite+React+TypeScript uygulamaları `frontend/admin` ve `frontend/field` olarak taşınacak ve backend servislerine bağlanacak.

### 13.1 Mevcut Şablon Gerçekliği

| Şablon | Kaynak | Hedef | Durum |
|--------|--------|-------|-------|
| **komuta** | `frontend_sablon_tasarim/komuta/` | `frontend/admin/` | Tam React+TS uygulaması, UI hazır |
| **mobil** | `frontend_sablon_tasarim/mobil/` | `frontend/field/` | Tam React+TS PWA, Dexie.js entegre |

### 13.2 Entegrasyon Workflow (Yeni)

Mevcut Komponent Analizi
↓
Mevcut React komponentlerini incele
Prop interface'lerini belirle
Mock veri kaynaklarını tespit et

Servis Katmanı Ekleme
↓
api.ts (REST client)
websocket.ts (WS client)
syncQueue.ts (offline sync)

Store Katmanı Ekleme
↓
Zustand stores oluştur
Mock data → store data geçişi
Optimistic UI pattern uygula

Komponent Wiring
↓
Komponentleri store'lara bağla
API call'ları entegre et
Offline fallback ekle

### 13.3 Entegrasyon Checklist (Her uygulama için)

- [X] Uygulama `frontend/` altına taşındı
- [X] API client servisi eklendi (api.ts)
- [X] WebSocket client servisi eklendi (websocket.ts)
- [X] Zustand store'lar oluşturuldu
- [X] Mock data → API/store verisi geçişi yapıldı
- [X] Offline-first sync queue entegre edildi
- [X] Error handling eklendi
- [X] Connection status göstergesi bağlandı
- [X] Offline mode test edildi


---


## 14. Deployment ve DevOps

### 14.1 Deployment Stratejisi: Bare-Metal (systemd + Nginx)

> **[DEPRECATED] Docker yaklaşımı terk edilmiştir.** Master Node, afet bölgesinde kaynak kısıtlı bir cihaz (Mini-PC / Raspberry Pi) olacağından Docker overhead'i kabul edilemez. Bare-metal deployment tercih edilmiştir.

#### 14.1.1 Backend: Uvicorn + systemd

```ini
# /etc/systemd/system/triage-backend.service
[Unit]
Description=TRIAGE FastAPI Backend
After=network.target

[Service]
Type=simple
User=triage
WorkingDirectory=/opt/triage-v2/backend
Environment="PATH=/opt/triage-v2/backend/venv/bin"
EnvironmentFile=/opt/triage-v2/backend/.env
ExecStart=/opt/triage-v2/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

#### 14.1.2 Frontend: Nginx Static Serving

```nginx
# /etc/nginx/sites-available/triage
server {
    listen 80;
    server_name 192.168.1.1;

    # Admin Dashboard (Komuta Merkezi)
    location / {
        root /opt/triage-v2/frontend/admin/dist;
        try_files $uri $uri/ /index.html;
    }

    # Field App (Saha Uygulaması)
    location /field/ {
        alias /opt/triage-v2/frontend/field/dist/;
        try_files $uri $uri/ /field/index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket Proxy
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### 14.1.3 Deployment Script

```bash
#!/bin/bash
# scripts/deploy.sh
set -e

echo "=== TRIAGE Bare-Metal Deploy ==="

# Backend
cd /opt/triage-v2/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart triage-backend

# Frontend Admin
cd /opt/triage-v2/frontend/admin
npm ci && npm run build

# Frontend Field
cd /opt/triage-v2/frontend/field
npm ci && npm run build

# Nginx
sudo systemctl restart nginx

echo "=== Deploy tamamlandı ==="
```

### 14.2 Environment Variables

```bash
# .env.example
# Backend
GEMINI_API_KEY=your_gemini_api_key_here
SECRET_KEY=your_jwt_secret_key_here
DATABASE_URL=sqlite:///./data/triage.db
AFAD_API_URL=https://api.afad.gov.tr/v1
CORS_ORIGINS=*

# Frontend
VITE_API_URL=http://192.168.1.1:8000
VITE_WS_URL=ws://192.168.1.1:8000
```

### 14.3 WiFi Hotspot Configuration

**Master Node olarak kullanılacak cihaz (Laptop/Raspberry Pi) için:**

```bash
#!/bin/bash
# scripts/setup-hotspot.sh

# Network interface (wlan0, wlp3s0 vb.)
INTERFACE="wlan0"

# Hotspot configuration
SSID="TRIAGE-AFET-NOKTA-1"
PASSWORD="AFET2024-SECURE"

# Install required packages
sudo apt-get update
sudo apt-get install -y hostapd dnsmasq

# Configure hostapd
cat > /etc/hostapd/hostapd.conf << EOF
interface=$INTERFACE
driver=nl80211
ssid=$SSID
hw_mode=g
channel=6
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$PASSWORD
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

# Configure dnsmasq
cat > /etc/dnsmasq.conf << EOF
interface=$INTERFACE
dhcp-range=192.168.1.11,192.168.1.254,255.255.255.0,24h
EOF

# Configure static IP for master node
sudo ip addr add 192.168.1.1/24 dev $INTERFACE

# Start services
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq
sudo systemctl start hostapd
sudo systemctl start dnsmasq

echo "Hotspot started: $SSID"
```

---

## 15. Test Stratejisi

### 15.1 Backend Tests

```python
# backend/tests/test_sync.py
import pytest
from fastapi.testclient import TestClient
from main import app
from database import Base, engine

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_sync_push_local_changes():
    # Create a device first
    response = client.post("/api/v1/auth/register-device", json={
        "device_id": "TEST-001",
        "device_name": "Test Device"
    })
    token = response.json()["access_token"]
    
    # Push a task update
    response = client.patch(
        "/api/v1/tasks/1",
        json={
            "status": "false_alarm",
            "local_updated_at": 1704123456789
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert response.json()["status"] == "false_alarm"

def test_conflict_resolution():
    # TODO: Implement conflict resolution test
    pass
```

### 15.2 Frontend Tests

```javascript
// frontend/src/services/__tests__/syncQueue.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { syncQueue } from '../syncQueue';
import { db } from '../localDb';

describe('SyncQueue', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });
  
  it('should add operations to queue', async () => {
    await syncQueue.add({
      collection: 'tasks',
      operation: 'update',
      data: { id: 1, status: 'completed' }
    });
    
    const pending = await db.syncQueue
      .where('synced').equals(false)
      .toArray();
    
    expect(pending).toHaveLength(1);
    expect(pending[0].collection).toBe('tasks');
  });
  
  it('should process queue when online', async () => {
    // Mock online status
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true
    });
    
    await syncQueue.add({
      collection: 'tasks',
      operation: 'update',
      data: { id: 1, status: 'completed' }
    });
    
    await syncQueue.processQueue();
    
    const synced = await db.syncQueue
      .where('synced').equals(true)
      .toArray();
    
    expect(synced).toHaveLength(1);
  });
});
```

---

## 16. Performans Optimizasyonu

### 16.1 Backend Optimizations

```python
# Use connection pooling
from sqlalchemy.pool import StaticPool

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    pool_pre_ping=True  # Check connection before use
)

# Batch database operations
async def bulk_update_tasks(task_updates: List[Dict]):
    async with db_session() as session:
        # Use bulk_update_mappings for better performance
        await session.bulk_update_mappings(Task, task_updates)
        await session.commit()

# Cache frequently accessed data
from functools import lru_cache

@lru_cache(maxsize=100)
def get_zone_by_id(zone_id: int):
    return db_session.query(Zone).filter(Zone.id == zone_id).first()
```

### 16.2 Frontend Optimizations

```javascript
// Debounce location updates
import { debounce } from 'lodash';

const updateLocation = debounce((lat, lng) => {
  wsManager.send({
    type: 'location_update',
    lat,
    lng
  });
}, 5000);  // Update every 5 seconds max

// Virtual scrolling for long lists
import { FixedSizeList } from 'react-window';

function TaskQueue({ tasks }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <TaskCard task={tasks[index]} />
    </div>
  );
  
  return (
    <FixedSizeList
      height={600}
      itemCount={tasks.length}
      itemSize={120}
    >
      {Row}
    </FixedSizeList>
  );
}

// Preload map tiles
const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  useCache: true,
  crossOrigin: true
});
```

---

## 17. Ekip Rolleri ve Sorumluluklar

### 17.1 Backend Developer
**Sorumluluklar:**
- FastAPI endpoint development
- Database schema design & migrations
- WebSocket server implementation
- AI integration (Gemini API)
- AFAD API client
- Authentication & security

**Gerekli Beceriler:**
- Python (FastAPI, SQLAlchemy)
- WebSocket protocols
- RESTful API design
- SQL
- AI/ML basics

### 17.2 Frontend Developer
**Sorumluluklar:**
- React component development
- Dexie.js integration
- WebSocket client
- Offline-first architecture
- UI/UX implementation
- PWA setup

**Gerekli Beceriler:**
- React + Hooks
- TailwindCSS
- IndexedDB / Dexie.js
- Service Workers
- WebSocket client
- Leaflet.js

### 17.3 Full-Stack Developer
**Sorumluluklar:**
- End-to-end feature development
- Sync logic implementation
- Conflict resolution
- Testing & debugging
- Deployment

### 17.4 DevOps Engineer
**Sorumluluklar:**
- Docker containerization
- WiFi hotspot configuration
- System monitoring
- Deployment automation
- Backup strategies

---

## 18. Kritik Notlar ve Best Practices

### 18.1 Offline-First Considerations

```javascript
// ALWAYS optimistic updates
async function saveData(data) {
  // ❌ YANLIŞ: Önce sunucuya gönder
  // await api.post('/data', data);
  // await localDB.save(data);
  
  // ✅ DOĞRU: Önce lokale kaydet
  await localDB.save(data);
  syncQueue.add(data);
  
  // Arka planda sync
  if (isOnline) {
    syncQueue.process();
  }
}
```

### 18.2 WebSocket Best Practices

```python
# Heartbeat for connection health
@app.websocket("/ws/{device_id}")
async def websocket_endpoint(websocket: WebSocket, device_id: str):
    await ws_manager.connect(websocket, device_id)
    
    try:
        while True:
            # Send heartbeat every 30 seconds
            await asyncio.sleep(30)
            await websocket.send_json({"type": "ping"})
            
            # Wait for pong (with timeout)
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=10
                )
                if data.get("type") != "pong":
                    await handle_message(data)
            except asyncio.TimeoutError:
                # Client didn't respond to ping
                break
                
    except WebSocketDisconnect:
        ws_manager.disconnect(device_id)
```

### 18.3 Security Checklist

- [X] JWT tokens expire ve refresh mekanizması
- [X] SQL injection koruması (Pydantic validation)
- [X] XSS koruması (React otomatik escape)
- [X] CSRF token (gerekirse)
- [X] Rate limiting (DDoS koruması)
- [X] HTTPS (production'da zorunlu)
- [X] Sensitive data encryption (şifreler vb.)

---

## 19. Sonuç ve Next Steps

Bu doküman, TRIAGE sisteminin tam bir teknik blueprint'ini sunmaktadır. 

### İlk Başlangıç Adımları:

1. **Backend kurulumu:**
```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python main.py
```

2. **Frontend kurulumu:**
```bash
   cd frontend
   npm install
   npm run dev
```

3. **Database initialization:**
```bash
   python scripts/init_db.py
   python scripts/seed_data.py
```

4. **Frontend şablonları inceleme:**
```bash
   cd frontend_sablon_tasarim
   # HTML dosyalarını tarayıcıda açıp inceleyin
```

### Ekip İçin Öneriler:

- **Daily standups:** Her gün 15dk, sync durumu, blocker'lar
- **Sprint planning:** 2 haftada bir, task prioritization
- **Code review:** Her PR için en az 1 approve
- **Testing:** Her feature için en az 1 test case

### Başarı Kriterleri:

- ✅ Sistem 100% offline çalışabiliyor
- ✅ WebSocket reconnection otomatik
- ✅ Conflict resolution çalışıyor
- ✅ AI prioritization doğru skorlar veriyor
- ✅ UI şablonları tam entegre
- ✅ Saha testleri başarılı

---

## 18. Feature Changelog

### v1.1 — Emergency Override & Advanced Offline Scoring

- [X] **Feature: Emergency Task Queuing** — Command Center can now dispatch tasks to teams with `busy` status. Busy teams appear with orange `[Meşgul - Kuyruğa Ekle]` badge in admin UI. No backend validation blocks manual assignment to busy teams. Team sees queued task as "Next Task".

- [X] **Feature: Advanced Weighted Mathematical Model for Offline Priority Scoring** — Replaced simplistic if/elif bucketed fallback with continuous weighted model: exponential magnitude scaling (`M^1.5 * 10`), depth attenuation (`max(1.0, depth*0.5)`), population density modifier, old building vulnerability factor, and distance decay. Outputs accurate 1.0–5.0 priority score when Gemini API is offline.

- [X] Refinement: Integrate logarithmic seismic attenuation model for offline priority scoring

- [X] Hotfix: Implement /api/v1/debug/ai-status endpoint and fix OpsHeader 404 polling error

- [X] Refinement: Dynamic protocol upgrade (HTTP→WS, HTTPS→WSS) and UI expansion for Field App server config

- [X] Hotfix: Correct Field App QR production domain mapping → `https://saha.gokberkceviker.com.tr`

- [X] Feature: UI Localization for Priority Badges (YÜKSEK, ORTA, DÜŞÜK) via `getPriorityLabel()`

- [X] Feature: Two-column Triage Routing logic (Urgent RED/YELLOW → Left ACİL KUYRUK, Backlog GREEN → Right YEDEK HAVUZ)

- [X] Hotfix: Wire Field App UI buttons to trigger P2P QR Share and Scan modals

- [X] Hotfix: Force dynamic key re-rendering on map polygons to bypass Leaflet pathOptions immutability

- [X] Hotfix: Implement array deduplication and strict UPSERT logic to resolve React key collisions in task lists

- [X] Hotfix: Eradicate Ghost Tasks by removing mock data, fixing ID sync, and enforcing frontend-backend state reconciliation

---

**Doküman Versiyonu:** 1.1  
**Son Güncelleme:** 2026-05-16  
**Hazırlayan:** TRIAGE Development Team