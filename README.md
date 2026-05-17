<div align="center">

<table align="center"><tr><td><pre>
████████╗██████╗ ██╗ █████╗  ██████╗ ███████╗
╚══██╔══╝██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝
   ██║   ██████╔╝██║███████║██║  ███╗█████╗  
   ██║   ██╔══██╗██║██╔══██║██║   ██║██╔══╝  
   ██║   ██║  ██║██║██║  ██║╚██████╔╝███████╗
   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
</pre></td></tr></table>

### **Autonomous Disaster Response Intelligence**
*AI-Powered Earthquake Triage System for Field Operations*

<br/>

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## İçindekiler

- [Problem](#-the-problem)
- [Çözüm](#-the-solution)
- [Canlı Demo](#-demo)
- [Özellikler](#-features)
- [Mimari](#-architecture)
- [Teknoloji Yığını](#-tech-stack)
- [Veri Kaynakları](#-data-sources)
- [AI Motoru](#-ai-engine)
- [Offline Senkronizasyon](#-offline-first-sync)
- [Kullanıcı Arayüzleri](#-dual-interface-design)
- [Veritabanı Şeması](#-database-schema)
- [API Referansı](#-api-reference)
- [Kurulum](#-quick-start)
- [Performans](#-performance-metrics)
- [Takım](#-team)

---

## 🔴 The Problem

Büyük bir depremden sonra ilk 72 saat kritik öneme sahiptir — ancak tam bu süreçte iletişim altyapısı çökmektedir.

```
Deprem anı → İlk 5 dakika
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Baz istasyonları aşırı yüklenip kapanıyor
  İnternet bağlantısı kesiliyor
  Kurtarma ekipleri koordinasyonu kaybediyor
  Aynı bölgeye birden fazla ekip gidiyor
  Kritik bölgeler saatlerce boş kalıyor
  Her geçen dakika, kurtarılamayan bir hayat
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Geleneksel sistemler: İnternet olmadan çalışmaz.
TRIAGE: İnternet olmadan çalışmak için tasarlandı.
```

**6 Şubat 2023 Kahramanmaraş depremleri (Mw 7.8 + 7.5):**
İlk saatlerde koordinasyon eksikliği, arama-kurtarma ekiplerinin kritik bölgelere geç ulaşmasına neden oldu. Kâğıt ve telsizle yürütülen saha koordinasyonu, 21. yüzyılın dijital çözüm gerektiren bir felaketi için yetersiz kaldı.

---

## ✅ The Solution

**TRIAGE**, internetten bağımsız, yerel ağ üzerinde tamamen çalışan bir afet koordinasyon sistemidir.

Tek bir master node (Raspberry Pi, mini-PC veya laptop) tüm stack'i çalıştırır. Saha ekipleri ve komuta merkezi, yerel WiFi ağı üzerinden gerçek zamanlı koordinasyon sağlar. İnternet geri geldiğinde sistem otomatik olarak merkez sunucuyla senkronize olur.

```
İnsan raporu beklenmez.
Sistem deprem algılar algılamaz karar verir.
Kurtarma ekipleri dispatch edilir.
Bölgeler önceliklendirilir.
Her şey internetsiz, yerel ağda.
```

---

## 🎬 Demo

> Sunum senaryosu: Canlı Kandilli verisi → M6.5 inject → AI analiz → otomatik dispatch → saha ekibi onayı

```bash
# Demo modunu başlat
POST /api/debug/inject-earthquake
{
  "lat": 38.4192,
  "lng": 27.1287,
  "magnitude": 6.5,
  "depth": 10,
  "location": "İzmir Körfezi"
}
```

Sistem yanıtı (~3 saniye):
1. Etki yarıçapı hesaplandı: **~89 km** *(Wells & Coppersmith, 1994)*
2. Risk bölgeleri oluşturuldu: **7 zone**, öncelik sıralı
3. Görevler atandı: **14 task**, en yakın ekipler dispatch edildi
4. Artçı şok tahmini: **İlk 6 saatte ~18 artçı** *(Omori Yasası)*
5. Komuta ekranı güncellendi, saha ekiplerine bildirim gitti

---

## ⚡ Features

### 🤖 Otonom AI Triage
- Kandilli, AFAD, USGS ve EMSC'den çoklu kaynak deprem verisi
- **Wells & Coppersmith (1994)** formülüyle sismik etki yarıçapı hesabı
- **Omori Yasası** ile artçı şok frekans tahmini
- Gemini 2.5 Flash ile risk bölgesi oluşturma ve görev üretimi
- İnternet yoksa anında devreye giren **Deterministic Fallback Engine**
- Haversine algoritmasıyla **otomatik en-yakın ekip dispatch**

### 🌐 Offline-First Architecture
- **Dexie.js (IndexedDB)** ile her saha cihazında lokal veritabanı
- **Outbox Pattern (SyncQueue)** — internet yokken işlemler kuyruğa alınır
- WebSocket üzerinden **timestamp tabanlı conflict resolution**
- **Workbox Service Worker** — UI çevrimdışında da anında yüklenir
- OpenStreetMap tile'ları **30 gün cache** — harita her koşulda açılır

### 🗺️ Harita & Görselleştirme
- **MapLibre GL JS** — WebGL tabanlı, binlerce nokta akıcı render
- **MTA Diri Fay Haritası** katmanı — 14.554 aktif fay segmenti
- Magnitude'e göre dinamik marker boyutu
- Hasar skoruna göre renk kodlu risk bölgeleri (kırmızı → yeşil)
- Gemini'nin ürettiği **organik asimetrik risk poligonları**
- **Isı haritası modu** — yoğunluk görünümü

### 📡 Acil Durum Yayın Protokolü
- **Web Audio API** ile sentetik siren sesi (MP3 dosyası gerekmez)
- Kritik görev atamalarında **haptik geri bildirim** (mobil titreşim)
- **Swipe-to-Confirm** — stres altında yanlış onayı engeller
- **`🔴 OFFLINE — Deterministic Mode`** / **`🟢 ONLINE — AI Mode`** durum göstergesi
- Canlı ekip konum takibi — haritada gerçek zamanlı hareket

### 📊 Komuta Merkezi
- Deprem büyüklük-zaman grafiği (Recharts)
- Tüm ekiplerin batarya seviyesi göstergesi (`navigator.getBattery()`)
- Canlı dispatch timeline — "18:32 Deprem → 18:33 AI → 18:35 Dispatch"
- Vatandaş raporları — serbest metin → Gemini parse → haritaya düş

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MASTER NODE (LAN)                           │
│                   192.168.1.1 / localhost                       │
│                                                                 │
│  ┌──────────┐   ┌────────────────┐   ┌──────────────────────┐   │
│  │  Nginx   │   │  FastAPI 0.115 │   │   Gemini AI Engine   │   │
│  │ :80/:443 │──▶│  Uvicorn Async │──▶│   2.5 Flash          │   │
│  │  Reverse │   │  WebSocket     │   │   Structured JSON    │   │
│  │  Proxy   │   │  GZip Middleware│  │ + Deterministic      │   │
│  └──────────┘   └───────┬────────┘   │   Fallback Engine    │   │
│                         │            └──────────────────────┘   │
│              ┌──────────▼──────────┐                            │
│              │   SQLite + WAL Mode │                            │
│              │   aiosqlite async   │                            │
│              │   SQLAlchemy 2.0    │                            │
│              └─────────────────────┘                            │
│                                                                 │
│  Veri Servisleri:                                               │
│  ┌──────────┐ ┌──────┐ ┌──────┐ ┌──────┐                        │
│  │ Kandilli │ │ AFAD │ │ USGS │ │ EMSC │  (çoklu kaynak)        │
│  └──────────┘ └──────┘ └──────┘ └──────┘                        │
└────────────────────┬───────────────────────┬────────────────────┘
                     │     WebSocket / REST   │
          ┌──────────▼──────┐     ┌───────────▼──────────┐
          │  KOMUTA MERKEZİ │     │    SAHA UYGULAMASI   │
          │  Admin PWA      │     │    Field PWA         │
          │                 │     │                      │
          │  Landscape      │     │  Portrait            │
          │  MapLibre GL    │     │  Swipe Actions       │
          │  Recharts       │     │  GPS Tracking        │
          │  Timeline       │     │  Dexie.js (local DB) │
          │  Zustand        │     │  Offline Queue       │
          │  Framer Motion  │     │  Haptic Feedback     │
          └─────────────────┘     └──────────────────────┘
```

---

## 🛠 Tech Stack

| Katman | Teknoloji | Versiyon | Amaç |
|--------|-----------|----------|------|
| **AI** | Google Gemini | 2.5 Flash | Risk analizi, rapor parse, görev üretimi |
| **Backend** | FastAPI + Uvicorn | 0.115 | Async API, WebSocket, GZip |
| **ORM** | SQLAlchemy + aiosqlite | 2.0 | Async veritabanı erişimi |
| **Database** | SQLite WAL Mode | — | Sıfır kurulum, yüksek eşzamanlılık |
| **Admin UI** | React + Vite | 19 / 6 | Komuta merkezi dashboard |
| **Field UI** | React + Vite | 19 / 6 | Saha PWA, portrait optimize |
| **Harita** | MapLibre GL JS | — | WebGL, çevrimdışı tile desteği |
| **State** | Zustand + persist | — | Global state + lokal depolama |
| **Offline DB** | Dexie.js | — | IndexedDB wrapper, field cihazları |
| **Animasyon** | Framer Motion | — | OLED geçişler, mikro etkileşimler |
| **Grafikler** | Recharts | — | Büyüklük, zaman, batarya grafikleri |
| **Bildirim** | Sonner | — | Toast, acil durum anonsları |
| **Stil** | TailwindCSS | 4.1 | OLED siyah, cyber-baroque tema |
| **Deploy** | systemd + Nginx | — | Auto-restart, reverse proxy |
| **PWA** | Workbox | — | Service worker, tile cache |

---

## 📡 Data Sources

TRIAGE, tek kaynak yerine dört bağımsız veri sağlayıcıyı çapraz doğrulama ile kullanır:

| Kaynak | Endpoint | Format | Güncelleme |
|--------|----------|--------|-----------|
| **Kandilli (KOERI)** | `api.orhanaydogdu.com.tr/deprem/kandilli/live` | JSON | Anlık |
| **AFAD** | `deprem.afad.gov.tr/apiv2/event/filter` | JSON | Anlık |
| **USGS** | `earthquake.usgs.gov/fdsnws/event/1/query` | GeoJSON | 1 dk |
| **EMSC** | `seismicportal.eu/fdsnws/event/1/query` | JSON | Anlık |

**Harita & Coğrafi Veri:**
- **MTA Diri Fay Haritası** — 14.554 aktif fay segmenti (GeoJSON)
- **Türkiye İl/İlçe GeoJSON** — sınır ve bölge verileri
- **AFAD Toplanma Alanları** — sahaya en yakın güvenli noktalar
- **OpenStreetMap** — çevrimdışı harita tile'ları (Workbox, 30 gün cache)

> [!NOTE]
> **Coğrafi Veri Dosyalarının Temini (GeoJSON):**
> Projede harita katmanları ve sismik etki analizlerinde kullanılan büyük boyutlu GeoJSON dosyaları, repo boyutunu optimize etmek amacıyla `.gitignore` kapsamına alınmıştır. Uygulamayı yerelinizde tam işlevsellikle çalıştırmak için aşağıdaki veri dosyalarını indirip `/data` (veya `backend/data`) dizinine yerleştirmelisiniz:
> 
> 1. **`turkey_faults.geojson`** — MTA Diri Fay Haritası: MTA Yerbilimleri Harita Portalı'ndan veya GitHub üzerindeki güncel halka açık aktif fay hattı GeoJSON depolarından indirebilirsiniz.
> 2. **`turkey_provinces.geojson`** — Türkiye Mülki İdari Sınırları: İl ve ilçe sınırlarını içeren GeoJSON verilerini GADM (Database of Global Administrative Areas) üzerinden ya da açık kaynak coğrafi veri havuzlarından indirebilirsiniz.
> 3. **`assembly_points.geojson`** — AFAD Acil Durum Toplanma Alanları: AFAD Açık Veri Portalı'ndan veya e-Devlet toplanma alanları servisinden coğrafi formatta indirebilirsiniz.

---

## 🧠 AI Engine

### Sismik Analiz Pipeline

```
Kandilli/AFAD/USGS/EMSC
         │
         ▼
┌─────────────────────┐
│  1. Wells &         │   log(L) = -2.44 + 0.59 * M
│     Coppersmith     │   Etki yarıçapı: R = e^(0.8*M) / depth
│     (1994)          │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  2. Omori Yasası    │   λ(t) = K / (t + c)^p
│     Artçı Şok       │   p=1.1, c=0.1, K=f(M)
│     Tahmini         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  3. Gemini 2.5      │   → Organik risk poligonları (GeoJSON)
│     Flash           │   → Risk skoru (1.0 – 5.0)
│     (Structured     │   → Görev tipi (SEARCH/LOGISTICS/COMMS)
│      JSON Output)   │   → Ekip tahsisi önerileri
└────────┬────────────┘
         │
         ▼ (internet yoksa)
┌─────────────────────┐
│  4. Deterministic   │   Kural tabanlı, anlık
│     Fallback Engine │   magnitude + depth + nüfus yoğunluğu
└─────────────────────┘
```

### Gemini Prompt Çıktı Şeması

```json
{
  "zones": [
    {
      "name": "string",
      "priority": 1,
      "risk_score": 4.7,
      "geometry": { "type": "Polygon", "coordinates": [[...]] },
      "tasks": [
        {
          "type": "SEARCH_AND_RESCUE",
          "description": "string",
          "estimated_casualties": 12,
          "required_teams": 2
        }
      ]
    }
  ],
  "aftershock_probability_6h": 0.87,
  "summary": "string"
}
```

### Vatandaş Raporu Parse

```
Girdi:  "Bornova 3. sokak sarı bina çöktü, en az 5 yaralı var"
         │
         ▼ Gemini 2.5 Flash
         │
Çıktı:  {
          "lat": 38.4619,
          "lng": 27.2177,
          "severity": 4,
          "category": "structural_collapse",
          "casualties_estimated": 5,
          "summary": "Yapısal çöküş, çoklu yaralı bildirimi"
        }
```

---

## 🔄 Offline-First Sync

### Outbox Pattern

```
[Saha Cihazı — WiFi Yok]
         │
         ▼
  Görev güncelle
         │
         ▼
  IndexedDB (Dexie.js)
  SyncQueue'ya ekle:
  { id, entity, operation, timestamp, payload }
         │
         ▼ (WiFi kapsama alanına girince)
         │
  WebSocket SYNC_REQUEST
         │
         ▼
[Master Node]
  Conflict Resolution:
  ┌─ client_ts > server_ts → İstemci kazanır
  ├─ Eşit timestamp → Kritik durum öncelikli
  └─ Kabul edildi → Tüm cihazlara broadcast
```

### Conflict Resolution Kuralları

| Durum | Kural |
|-------|-------|
| `client_ts > server_ts` | İstemci verisi kabul edilir |
| Eşit timestamp | `resolved > assigned > pending` |
| Network error | Retry with exponential backoff |
| Kabul edilen değişiklik | WebSocket broadcast → tüm cihazlar |

---

## 🖥 Dual Interface Design

### Komuta Merkezi (Admin PWA)
Landscape optimized — büyük ekran, veri yoğun:

```
┌──────────────────────────────────────────────────────────┐
│  🔴 TRIAGE  │  M 6.5 — İzmir Körfezi  │  🟢 AI ONLINE   │
├─────────────┬──────────────────────────────┬─────────────┤
│ ZONE LIST   │                              │  DISPATCH   │
│             │      MapLibre GL Map         │  TIMELINE   │
│ 🔴 Bornova  │   (fay hatları, poligonlar,  │             │
│  Score: 4.7 │    ekip konumları, pinler)   │ 18:32 Deprem│
│             │                              │ 18:33 AI ✓  │
│ 🟡 Karşıyaka│                              │ 18:35 →A1   │
│  Score: 3.1 │                              │ 18:36 →B2   │
│             │                              │             │
│ 🟢 Buca     │                              │ EKIPLER     │
│  Score: 1.4 │                              │ A1 🔋87%    │
│             │                              │ B2 🔋62%    │
│ RAPORLAR    │                              │ C3 🔋41% ⚠  │
│ 3 yeni      │                              │             │
└─────────────┴──────────────────────────────┴─────────────┘
```

### Saha Uygulaması (Field PWA)
Portrait optimized — tek el kullanımı:

```
┌─────────────────────┐
│  TRIAGE — Saha      │
│  🔴 Kritik Görev    │
│                     │
│  📍 Bornova         │
│  3. Sokak Bloğu     │
│                     │
│  Yapısal çöküş      │
│  ~5 yaralı tahmini  │
│                     │
│  ──────────────     │
│  ← Reddet           │
│       Onayla →      │
│  (Kaydırarak onayla)│
│                     │
│  📡 Konum: AÇIK     │
│  🔋 Batarya: %72    │
│  ☁️ Sync: bekliyor  │
└─────────────────────┘
```

---

## 🗄 Database Schema

```sql
-- Depremler
CREATE TABLE earthquakes (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL,           -- kandilli|afad|usgs|emsc
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    magnitude   REAL NOT NULL,
    depth       REAL NOT NULL,
    location    TEXT,
    timestamp   DATETIME NOT NULL,
    processed   BOOLEAN DEFAULT FALSE,
    rupture_km  REAL,                    -- Wells & Coppersmith
    aftershock_6h_estimate INTEGER      -- Omori tahmini
);

-- AI Risk Bölgeleri
CREATE TABLE zones (
    id          TEXT PRIMARY KEY,
    earthquake_id TEXT REFERENCES earthquakes(id),
    name        TEXT NOT NULL,
    priority    INTEGER NOT NULL,        -- 1 (kritik) → 5 (düşük)
    risk_score  REAL NOT NULL,           -- 1.0 – 5.0
    color       TEXT NOT NULL,           -- red|orange|yellow|green
    geometry    TEXT NOT NULL,           -- GeoJSON Polygon
    created_at  DATETIME NOT NULL,
    engine      TEXT DEFAULT 'gemini'    -- gemini|fallback
);

-- Görevler
CREATE TABLE tasks (
    id          TEXT PRIMARY KEY,
    zone_id     TEXT REFERENCES zones(id),
    type        TEXT NOT NULL,           -- SEARCH|LOGISTICS|COMMS|DAMAGE
    description TEXT NOT NULL,
    priority    INTEGER NOT NULL,
    status      TEXT DEFAULT 'pending',  -- pending|assigned|active|done
    team_id     TEXT REFERENCES teams(id),
    assigned_at DATETIME,
    completed_at DATETIME,
    created_at  DATETIME NOT NULL
);

-- Saha Ekipleri
CREATE TABLE teams (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    device_id   TEXT UNIQUE,
    lat         REAL,
    lng         REAL,
    battery     INTEGER,                 -- 0-100
    status      TEXT DEFAULT 'idle',     -- idle|assigned|active
    last_seen   DATETIME,
    jwt_token   TEXT
);

-- Vatandaş Raporları
CREATE TABLE reports (
    id          TEXT PRIMARY KEY,
    lat         REAL,
    lng         REAL,
    raw_text    TEXT NOT NULL,
    severity    INTEGER,                 -- 1-5
    category    TEXT,                    -- structural|fire|medical|trapped
    ai_summary  TEXT,
    parsed      BOOLEAN DEFAULT FALSE,
    timestamp   DATETIME NOT NULL
);

-- Senkronizasyon Kuyruğu
CREATE TABLE sync_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL,
    entity      TEXT NOT NULL,
    operation   TEXT NOT NULL,           -- create|update|delete
    payload     TEXT NOT NULL,           -- JSON
    client_ts   DATETIME NOT NULL,
    synced_at   DATETIME,
    status      TEXT DEFAULT 'pending'   -- pending|synced|conflict
);

-- Sistem Olayları
CREATE TABLE system_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,           -- earthquake|ai_analysis|dispatch|sync
    message     TEXT NOT NULL,
    metadata    TEXT,                    -- JSON
    created_at  DATETIME NOT NULL
);
```

---

## 📡 API Reference

### Deprem Endpointleri

```http
GET    /api/earthquakes                 # Son depremler listesi
GET    /api/earthquakes/{id}            # Deprem detayı + zonelar
POST   /api/earthquakes/analyze         # Manuel AI analiz tetikle
GET    /api/earthquakes/poll            # Tüm kaynaklardan veri çek

# Sadece demo/test
POST   /api/debug/inject-earthquake     # Simüle deprem enjekte et
```

### Görev & Dispatch Endpointleri

```http
GET    /api/tasks                       # Tüm görevler (filtreli)
GET    /api/tasks/{id}                  # Görev detayı
PUT    /api/tasks/{id}/status           # Durum güncelle
POST   /api/tasks/{id}/assign/{team_id} # Manuel ekip ata
POST   /api/dispatch/auto               # Otomatik Haversine dispatch
```

### Ekip Endpointleri

```http
GET    /api/teams                       # Tüm ekipler + konumlar
POST   /api/teams                       # Yeni ekip kaydet
PUT    /api/teams/{id}/location         # GPS konum güncelle
GET    /api/teams/{id}/battery          # Batarya durumu
```

### Rapor Endpointleri

```http
GET    /api/reports                     # Tüm vatandaş raporları
POST   /api/reports                     # Yeni rapor gönder
POST   /api/reports/{id}/parse          # Gemini ile parse et
```

### Senkronizasyon

```http
WebSocket /ws                           # Gerçek zamanlı bağlantı
POST      /api/sync                     # Outbox kuyruğunu gönder
GET       /api/sync/status              # Sync durumu
```

### WebSocket Mesaj Tipleri

```json
// Gelen
{ "type": "SYNC_REQUEST", "device_id": "...", "queue": [...] }

// Giden
{ "type": "EARTHQUAKE_NEW", "data": { ... } }
{ "type": "TASK_UPDATED",   "data": { ... } }
{ "type": "TEAM_MOVED",     "data": { "team_id": "A1", "lat": 38.4, "lng": 27.1 } }
{ "type": "SYNC_ACK",       "data": { "accepted": [...], "conflicts": [...] } }
```

---

## 🚀 Quick Start

### Gereksinimler

- Python 3.11+
- Node.js 18+
- `GEMINI_API_KEY` (opsiyonel — fallback engine her zaman çalışır)

### 1. Repo'yu Klonla

```bash
git clone https://github.com/[username]/triage-ebhack26.git
cd triage-ebhack26
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Linux/Mac
source venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt

# .env dosyası oluştur
echo "GEMINI_API_KEY=your_key_here" > .env

# Başlat
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Admin Dashboard

```bash
cd frontend/admin
npm install
npm run dev
# → http://localhost:5173
```

### 4. Field App

```bash
cd frontend/field
npm install
npm run dev
# → http://localhost:5174
```

### 5. Yerel Ağ Deploy (Hackathon / Saha)

```bash
# Otomatik kurulum scripti
chmod +x scripts/setup_server.sh
sudo ./scripts/setup_server.sh

# Sistem servisi olarak başlat (auto-restart)
sudo systemctl enable triage-backend
sudo systemctl start triage-backend

# Durumu kontrol et
sudo systemctl status triage-backend
```

Aynı WiFi ağındaki tüm cihazlar `192.168.1.1` üzerinden sisteme erişir.

---

## 📊 Performance Metrics

| Metrik | Değer |
|--------|-------|
| API yanıt süresi (GZip) | ~%40 küçük payload |
| SQLite WAL okuma | Yazma sırasında eşzamanlı okuma |
| PWA precache (Admin) | 661 KiB |
| PWA precache (Field) | 635 KiB |
| Harita tile cache | 500 tile, 30 gün |
| Otomatik dispatch | < 50ms (Haversine + priority sort) |
| AI analiz süresi | ~3s (Gemini) / anlık (fallback) |
| WebSocket sync | < 100ms yerel ağda |
| Offline kuyruk limiti | Sınırsız (IndexedDB) |
| Kandilli poll aralığı | 15 saniye |

---

## 📁 Project Structure

```
triage-ebhack26/
├── backend/
│   ├── main.py                    # FastAPI app, CORS, WebSocket, GZip
│   ├── database.py                # SQLite WAL + async sessions
│   ├── models.py                  # SQLAlchemy modelleri
│   ├── requirements.txt
│   ├── .env                       # GEMINI_API_KEY
│   ├── services/
│   │   ├── kandilli.py            # Çoklu kaynak deprem fetcher
│   │   ├── ai_engine.py           # Gemini 2.0 Flash + structured output
│   │   ├── fallback_engine.py     # Deterministic rule-based scoring
│   │   ├── task_generator.py      # Zone + görev oluşturma
│   │   ├── dispatcher.py          # Haversine nearest-team dispatch
│   │   └── sync_service.py        # Conflict resolution engine
│   ├── routes/
│   │   ├── earthquakes.py
│   │   ├── tasks.py
│   │   ├── teams.py
│   │   ├── reports.py
│   │   ├── sync.py
│   │   └── debug.py               # inject-earthquake endpoint
│   └── tests/
│       └── test_api.py
├── frontend/
│   ├── admin/                     # Komuta Merkezi PWA
│   │   └── src/
│   │       ├── components/
│   │       │   ├── Map.jsx        # MapLibre GL, fay hatları, poligonlar
│   │       │   ├── ZonePanel.jsx  # Risk bölgesi listesi
│   │       │   ├── DispatchList.jsx
│   │       │   ├── Timeline.jsx   # Canlı olay akışı
│   │       │   ├── TeamPanel.jsx  # Ekip + batarya durumu
│   │       │   └── ReportFeed.jsx # Vatandaş raporları
│   │       └── App.jsx
│   └── field/                     # Saha PWA
│       └── src/
│           ├── components/
│           │   ├── TaskCard.jsx   # Swipe-to-confirm
│           │   ├── GPSTracker.jsx
│           │   └── OfflineQueue.jsx
│           └── App.jsx
├── data/
│   ├── turkey_faults.geojson      # MTA Diri Fay Haritası
│   ├── turkey_provinces.geojson   # İl sınırları
│   └── assembly_points.geojson    # AFAD toplanma alanları
├── scripts/
│   └── setup_server.sh            # Bare-metal deployment
├── docs/
│   └── USER_GUIDE.md              # Türkçe kullanım kılavuzu
├── CONTEXT.md                     # AI geliştirme bağlamı
├── DESIGN.md                      # UI/UX spesifikasyonları
├── FEATURES.md                    # Özellik listesi ve öncelikler
└── README.md
```

---

## 👥 Team

**EBST Hackathon '26** — Balıkesir Üniversitesi Çağış Kampüsü

> *42 saat. Bir senaryo. Bir çözüm.*

Balıkesir Üniversitesi Elektrik ve Bilgisayar Sistemleri Topluluğu (EBST) tarafından düzenlenen, T.C. Gençlik ve Spor Bakanlığı destekli EBHACK '26 etkinliği kapsamında geliştirilmiştir.

---

## 📚 Bilimsel Referanslar

- Wells, D.L. & Coppersmith, K.J. (1994). *New empirical relationships among magnitude, rupture length, rupture area, and surface displacement.* BSSA, 84(4), 974–1002.
- Utsu, T., Ogata, Y. & Matsu'ura, R.S. (1995). *The centenary of the Omori formula for a decay law of aftershock activity.* J. Physics of the Earth, 43, 1–33.
- Emre, Ö. et al. (2018). *Active fault database of Turkey.* Bulletin of Earthquake Engineering, 16(8), 3229–3275.

---

## 📄 License

MIT License — © 2026 TRIAGE Team

---

<div align="center">

<br/>

**TRIAGE** — *İnternet yokken bile hayat kurtarır.*

<br/>

`Deprem oldu` → `Sistem analiz etti` → `Ekipler dispatch edildi` → `Hayatlar kurtarıldı`

<br/>

[![EBST](https://img.shields.io/badge/EBST-Hackathon_2026-FF0000?style=for-the-badge)](https://ebsthackathon.com)
[![Balıkesir Üniversitesi](https://img.shields.io/badge/BAÜN-Çağış_Kampüsü-003366?style=for-the-badge)](https://balikesir.edu.tr)
[![Gençlik ve Spor Bakanlığı](https://img.shields.io/badge/T.C.-Gençlik_ve_Spor_Bakanlığı-E30A17?style=for-the-badge)](https://gsb.gov.tr)

</div>
