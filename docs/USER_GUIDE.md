# TRIAGE — Kullanım Kılavuzu

> Afet Yönetim Sistemi — Komuta Merkezi ve Saha Ekipleri için kapsamlı rehber.

---

## İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Komuta Merkezi (Admin Dashboard)](#komuta-merkezi-admin-dashboard)
3. [Saha Uygulaması (Field App)](#saha-uygulaması-field-app)
4. [Çevrimdışı Çalışma Modu](#çevrimdışı-çalışma-modu)
5. [Sorun Giderme](#sorun-giderme)

---

## Genel Bakış

TRIAGE, deprem sonrası arama-kurtarma operasyonlarını koordine eden, **internet bağlantısı olmadan çalışabilen** bir afet yönetim sistemidir.

### Sistem Bileşenleri

| Bileşen | Açıklama | Erişim |
|---------|----------|--------|
| **Komuta Merkezi** | Harita, ekip yönetimi, AI analiz | `http://<IP>:8080` |
| **Saha Uygulaması** | Mobil görev takibi, konum paylaşımı | `http://<IP>:8081` |
| **API Sunucusu** | Backend, WebSocket, veritabanı | `http://<IP>:8000` |

### İlk Kurulum

1. Cihazınızı Master Node'un WiFi ağına bağlayın
2. Tarayıcıda ilgili port adresini açın
3. Cihaz kaydı otomatik yapılır (JWT token ile)

---

## Komuta Merkezi (Admin Dashboard)

### 🗺️ Harita Paneli

Harita paneli, tüm görev ve ekipleri gerçek zamanlı olarak gösterir.

- **Kırmızı İşaretçiler**: Yüksek öncelikli (RED) görevler
- **Sarı İşaretçiler**: Orta öncelikli (YELLOW) görevler
- **Yeşil İşaretçiler**: Düşük öncelikli (GREEN) görevler
- **Mavi İşaretçiler**: Saha ekiplerinin konumları

### 🤖 AI Analiz Tetikleme

1. Sol paneldeki **"AI Analiz Başlat"** butonuna tıklayın
2. Sistem otomatik olarak:
   - Kandilli Rasathanesi'nden son deprem verisini çeker
   - Gemini AI ile bölge risk analizi yapar
   - Etkilenen bölgeleri puanlar (1.0 – 5.0)
   - Görevleri otomatik oluşturur ve haritaya yerleştirir
   - Müsait ekiplere en yakın görevi atar
3. Sonuçlar haritada ve istihbarat panelinde anlık görünür

### 👥 Ekip Yönetimi

Komuta yan panelinden:

- **Ekip Durumu**: idle (müsait), busy (görevde), offline (çevrimdışı)
- **Görev Atama**: Otomatik (AI dispatcher) veya manuel
- **Destek Talebi**: Ekip "Destek İste" dediğinde, sistem otomatik en yakın müsait ekibi gönderir

### 📋 İstihbarat Günlüğü

Alt panelde sistem olayları gerçek zamanlı listelenir:

- AI analiz sonuçları
- Görev atamaları ve durum değişiklikleri
- Ekip bağlantı/kopu bildirimleri
- Senkronizasyon çakışmaları

---

## Saha Uygulaması (Field App)

### 📱 Cihaz Kaydı

1. Saha uygulamasını tarayıcıda açın (`http://<IP>:8081`)
2. Giriş ekranında:
   - **Cihaz Adı**: Ekip adınızı girin (örn: "Ekip Alfa-3")
   - **Giriş Yap** butonuna basın
3. Sistem cihazınızı kaydeder ve JWT token oluşturur

### 🗺️ Görev Haritası

- Aktif göreviniz haritada büyük bir işaretçi ile gösterilir
- GPS konumunuz otomatik paylaşılır (konum izni gerekir)
- Harita çevrimdışıyken de önbelleğe alınmış kutucuklarla çalışır

### 🎯 Görev Kartı ve Aksiyon Butonları

Aktif göreviniz olduğunda, ekranın alt kısmında 3 büyük kaydırma butonu görünür:

| Buton | Aksiyon | Ne Zaman Kullanılır |
|-------|---------|---------------------|
| ✅ **Tamamlandı** | Görevi `resolved` olarak işaretler | Bina tarandı, kurtarma tamamlandı |
| ❌ **Yanlış Alarm** | Görevi `false_alarm` olarak işaretler | Binada hasar yok veya kişi yok |
| 🆘 **Destek İste** | Görevi `needs_backup` olarak işaretler | Ek ekip desteği gerekiyor |

**Kullanım**: Butonu sola veya sağa **kaydırarak** onaylayın. Yanlışlıkla basılması önlenir.

### ⏳ Görev Bekleme Durumu

Eğer size atanmış aktif bir görev yoksa, ekranda **"Görev Bekleniyor..."** mesajı görünür. Yeni görev atandığında otomatik güncellenir.

---

## Çevrimdışı Çalışma Modu

### 📶 Bağlantı Göstergesi

Ekranın üst kısmındaki durum çubuğunda bağlantı durumunuz gösterilir:

| Gösterge | Anlam |
|----------|-------|
| 🟢 **Çevrimiçi** | Sunucuya bağlı, veriler gerçek zamanlı |
| 🟡 **Senkronizasyon** | Çevrimdışı işlemler gönderiliyor |
| 🔴 **Çevrimdışı** | Sunucu erişilemiyor, yerel çalışma |

### 💾 Yerel Veritabanı (Dexie.js)

- Tüm görev ve ekip verileri cihazınızdaki tarayıcı veritabanında saklanır
- İnternet kesilse bile görevlerinizi görebilir ve güncelleyebilirsiniz
- Güncellemeler otomatik olarak kuyruğa alınır (SyncQueue)

### 🔄 Senkronizasyon Süreci

1. **Çevrimdışıyken**: İşlemleriniz `syncQueue` tablosuna yazılır
2. **Bağlantı geldiğinde**: Kuyruk otomatik işlenir (en fazla 5 deneme)
3. **Çakışma durumunda**: Sunucu zaman damgası karşılaştırır:
   - Sizin verileriniz daha yeniyse → kabul edilir
   - Sunucu verisi daha yeniyse → çakışma bildirilir ve sunucu verisi uygulanır

### 📲 QR Kod ile P2P Görev Paylaşımı (Tamamen Çevrimdışı)

Hiçbir sunucu bağlantısı olmadığında bile ekipler arası görev devri yapılabilir:

1. **Görevleri Devreden Ekip**: Uygulama üzerinden "Görevleri Paylaş" butonuna basarak, üzerindeki aktif görevleri bir QR koda dönüştürür.
2. **Görevi Devralan Ekip**: Uygulama üzerinden "QR Tara" butonuna basarak, diğer ekibin cihazındaki QR kodu okutur.
3. Görev verileri (koordinatlar, öncelik, bina tipi vs.) anında devralan ekibin yerel veritabanına eklenir.
4. Sunucu bağlantısı yeniden sağlandığında, bu transferler otomatik olarak sunucuya iletilir.

---

## Sorun Giderme

### ❓ Uygulama açılmıyor

- Master Node'un WiFi ağına bağlı olduğunuzdan emin olun
- Doğru portu kullandığınızı kontrol edin (Admin: 8080, Saha: 8081)
- Tarayıcı önbelleğini temizleyin (Ctrl+Shift+R)

### ❓ Görevler güncellenmiyor

- Bağlantı göstergesini kontrol edin
- Çevrimdışıysanız, güncelleme bağlantı geldiğinde gönderilecektir
- SyncQueue'da bekleyen işlem sayısını kontrol edin

### ❓ Harita yüklenmiyor

- İlk açılışta internet bağlantısı gerekir (harita kutucukları indirilir)
- Sonraki kullanımlarda önbellekten çalışır (30 gün)
- WiFi sinyalinin yeterli olduğundan emin olun

### ❓ AI analiz çalışmıyor

- `GEMINI_API_KEY` ortam değişkeninin `.env` dosyasında tanımlı olduğunu kontrol edin
- API anahtarı yoksa sistem otomatik olarak kural tabanlı (fallback) analize geçer
- Fallback analiz de tam işlevseldir, sadece AI kadar detaylı değildir

### ❓ GPS konumu paylaşılmıyor

- Tarayıcının konum iznini verdiğinizden emin olun
- HTTPS veya localhost gereklidir (HTTP üzerinden konum çalışmaz)
- Cihazın GPS'inin açık olduğunu kontrol edin

### ❓ Sunucu yeniden başlatma

```bash
# Backend servisi yeniden başlat
sudo systemctl restart triage-backend

# Servis durumunu kontrol et
sudo systemctl status triage-backend

# Logları görüntüle
sudo journalctl -u triage-backend -f --no-pager -n 50
```

---

## 📞 Acil Durum Protokolü

1. Master Node'u açın ve WiFi hotspot'u başlatın
2. Komuta Merkezi'nden AI analizini tetikleyin
3. Saha ekiplerini WiFi ağına bağlayın
4. Görevler otomatik olarak dağıtılacaktır
5. Ekipler görev tamamladıkça yeni görevler otomatik atanır

> **⚡ Kritik**: Sistem internet olmadan tam kapasiteyle çalışır. 
> Tek ihtiyaç: cihazların aynı yerel ağda olması.

---

*TRIAGE — İnternet yokken bile hayat kurtarır.*
