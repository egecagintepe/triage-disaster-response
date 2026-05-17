# Proje Dosya Yapısı ve İşlevleri (File Dictionary)

Bu belge, TRIAGE projesindeki tüm önemli dosya ve dizinlerin işlevlerini detaylandırmaktadır.

## Kök Dizin (Root)

- `README.md`: Projenin genel tanıtımı, özellikleri ve kurulum talimatlarını içerir.
- `architecture.md`: Sistem mimarisini, veri akışını, veritabanı şemasını ve tasarım kararlarını detaylandıran teknik dokümandır.
- `package.json` / `package-lock.json`: Frontend projeleri ve çalışma alanı bağımlılıklarını yöneten dosya.

---

## Backend (`/backend`)

FastAPI tabanlı, senkronizasyon, WebSocket haberleşmesi ve AI analizlerini yürüten sunucu bileşenidir.

### Temel Dosyalar
- `main.py`: FastAPI uygulamasının ana giriş noktasıdır. Sunucu döngüsünü (triage loop), router'ları ve WebSocket yöneticisini başlatır.
- `database.py`: SQLAlchemy kullanarak SQLite veritabanı bağlantısını ve tablo kurulumunu (WAL modu dahil) yönetir.
- `config.py`: Ortam değişkenlerinin ve temel yapılandırma ayarlarının bulunduğu dosyadır.

### `/routes` (API Uç Noktaları)
- `admin.py`: AI analiz tetiklemeleri, deprem verilerinin çekilmesi ve test verisi (seed) oluşturulması gibi yönetici işlemlerini barındırır.
- `tasks.py`: Görevler (Tasks) üzerinde CRUD işlemleri yapar ve görev atama (`dispatcher.py`) işlemlerini tetikler.
- `teams.py`: Ekip oluşturma, konum güncelleme ve ekip silme endpoint'lerini barındırır.
- `auth.py`: JWT tabanlı cihaz kimlik doğrulaması işlemlerini içerir.

### `/services` (İş Mantığı ve Entegrasyonlar)
- `afad_client.py`: Kandilli Rasathanesi'nden anlık deprem verilerini çeker ve test verileri üretir.
- `ai_engine.py`: Google Gemini 2.0 Flash ile afet bölgelerinin hasar analizini yapar ve JSON formatında yapılandırılmış çıktılar üretir.
- `task_generator.py`: AI analiz sonuçlarına göre harita üzerinde görev koordinatlarını ve detaylarını otomatik oluşturur.
- `dispatcher.py`: Oluşturulan veya durumu değişen görevleri, GPS verilerine (Haversine formülü) göre en yakın müsait ekiplere otomatik atar.
- `sync_service.py`: Çevrimdışı saha ekiplerinden gelen senkronizasyon verilerini (Outbox Pattern) birleştirir ve zaman damgası tabanlı çakışma çözümü uygular.

### `/models` (Veritabanı Şemaları)
- `earthquake.py`: Çekilen deprem verilerinin veritabanı modelini barındırır.
- `task.py`: Kurtarma görevlerini (öncelik, koordinat, durum) temsil eden modeldir.
- `team.py`: Saha ekiplerinin adlarını, durumlarını ve son GPS koordinatlarını saklayan modeldir.
- `zone.py`: AI tarafından puanlanmış risk bölgelerinin (poligon koordinatlarıyla) modelini barındırır.
- `system_event.py`: Sistem günlüklerini (`SystemEvent`), görev tarihçelerini (`TaskHistory`) ve senkronizasyon loglarını (`SyncLog`) tutar.

---

## Komuta Merkezi (`/frontend/admin`)

React 19, Zustand ve React-Leaflet tabanlı masaüstü uyumlu harita ve yönetim paneli.

### Bileşenler ve Servisler
- `src/App.tsx`: Ana uygulama bileşeni; haritayı, yan paneli ve üst bildirim çubuğunu birleştirir.
- `src/components/Map.tsx`: React-Leaflet kütüphanesi kullanarak aktif görevleri, risk bölgelerini ve ekip konumlarını harita üzerinde gösterir.
- `src/components/CommandSidePanel.tsx`: Saha ekiplerini listeleme, AI analiz başlatma ve görev atama arayüzünü içerir.
- `src/components/IntelligenceLog.tsx`: Sistemde yaşanan değişikliklerin (AI analizi, görev ataması) kaydını gösteren bileşendir.
- `src/services/websocket.ts`: Sunucu ile çift yönlü iletişim kurar. Görev/Bölge/Ekip güncellemelerini alır ve Zustand state'ini anında günceller. Aynı zamanda IndexedDB'ye (Dexie) verileri önbellekler.
- `src/stores/`: Zustand kullanarak görev (`taskStore.ts`), ekip (`teamStore.ts`) ve bölge (`zoneStore.ts`) durumlarını (state) merkezi olarak yönetir.
- `src/services/localDb.ts`: Dexie.js kullanarak önbellekleme amaçlı yerel IndexedDB veritabanı yapılandırmasını içerir.

---

## Saha Uygulaması (`/frontend/field`)

Çevrimdışı çalışabilen (Offline-first), PWA özellikli, P2P yeteneklerine sahip mobil arayüz.

### Bileşenler ve Servisler
- `src/App.tsx`: Saha ekiplerinin ana arayüzüdür. Kayıt ekranı, harita görünümü ve görev bekleme/aktif görev kartlarını yönetir.
- `src/components/TaskCard.tsx`: Kaydırma (swipe) animasyonlarına sahip, görev durumu güncellemelerini (`Tamamlandı`, `Yanlış Alarm`, `Destek İste`) barındıran bileşendir.
- `src/components/QrShareModal.tsx`: Çevrimdışı senaryolarda ekipler arası P2P görev paylaşımını sağlayan QR kod oluşturucu bileşendir.
- `src/components/QrScannerModal.tsx`: Cihaz kamerasını kullanarak paylaşılan QR kod görev verilerini tarayan ve içeri aktaran bileşendir.
- `src/services/websocket.ts`: Çevrimiçi olunduğunda sunucudan görev atamalarını alır ve filtreleme (kendi görevlerini bulma) işlemleri yaparak Dexie veritabanını günceller.
- `src/services/localDb.ts`: Çevrimdışı veri depolamayı sağlayan (Dexie.js) yapılandırma dosyasıdır (`syncQueue` kuyruğunu barındırır).
- `src/services/syncQueue.ts`: Cihaz çevrimdışıyken yapılan işlemleri (görev durum değişiklikleri) yerelde kaydeder ve bağlantı geldiğinde sırayla sunucuya gönderir (Outbox pattern).

---

## Dağıtım ve DevOps (`/scripts`)

- `scripts/setup_server.sh`: Nginx, Python sanal ortamı ve systemd servis ayarlarını tek tıkla yapılandırıp sistemi canlıya alan bash kurulum betiğidir.
