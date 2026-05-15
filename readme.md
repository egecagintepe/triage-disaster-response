```markdown
# TRIAGE: Yerel Ağ Afet Yönetim Sistemi

**"Depremde internet çöktüğünde bile çalışan sistem."**

## 🚀 Proje Özeti
TRIAGE, afet anındaki iletişimsizlik kuralına ve internetin çökmesi senaryosuna %100 uyumlu olarak tasarlanmış asimetrik bir sistemdir. Sistem, Kandilli veya AFAD'dan aldığı ilk veriyi yerel ağa aktarır, yapay zeka ile bölgesel önceliklendirme yapar ve saha ekiplerine otonom olarak dinamik görev dağılımı gerçekleştirir.

## 🏗 Ağ ve Cihaz Topolojisi
İnternet altyapısının zarar gördüğü varsayımıyla sistem bir **Local Area Network** üzerinde çalışır.

* **Veri Merkezi:** Sahaya kurulan yerel sunucudur. Tüm AI analizi, ana veritabanı yönetimi ve ağ yönlendirmesi burada gerçekleşir.
* **Saha Cihazları:** Ekiplerin akıllı telefonlarında çalışan PWA (Progressive Web App) uygulamalarıdır. Sunucunun yerel Wi-Fi ağına bağlanarak IP alırlar.
* **Mesh & Senkronizasyon:** Saha cihazları Wi-Fi menziline girdiğinde merkezle otomatik olarak senkronize olur. Ekipler menzilden çıkıp enkaz alanına gittiklerinde, kendi lokal veritabanları ile kesintisiz çalışmaya devam ederler.

## 💻 Kullanılan Teknoloji Yığını
Senkron ve lokal veritabanlı bir yapı için geleneksel REST API yerine "Offline-First" mimarisi kullanılmıştır.

* **Frontend (PWA):** Hızlı tasarım için React ve TailwindCSS.
* **Lokal Veritabanı:** İnternet yokken görevlerin okunup yazılabilmesi için IndexedDB'nin en hafif versiyonu olan **Dexie.js**.
* **Haritalandırma:** Çevrimdışı harita gösterimi için önbelleğe alma yeteneği eklenmiş Leaflet.js.
* **Backend:** Soket iletişimi ve hızlı prototipleme için Python tabanlı FastAPI.
* **Gerçek Zamanlı Senkronizasyon:** Merkezle anlık iletişim ve veri alışverişi için **WebSockets**.
* **Ana Veritabanı:** SQLite
* **Yapay Zeka Katmanı:** Deprem anında çekilen verinin analizi ve öncelik skorlarının belirlenmesi için sunucuda çalışan Gemini API.

## 📱 Kullanıcı Arayüzü Segregasyonu
Kullanıcı deneyimi, cihazın rolüne göre iki farklı ekrana ayrılmıştır.

### 1. Veri Merkezi UI
* **Amaç:** Stratejik yönetim, analiz ve izleme.
* **Özellikler:** Kırmızı/Sarı/Yeşil AI öncelik poligonlarını gösteren büyük bir interaktif harita barındırır. Sahadaki tüm cihazların canlı konumunu, durumunu listeler ve açık, tamamlanmış, iptal edilmiş görevlerin loglarını tutar.

### 2. End Device UI
* **Amaç:** Operasyonel aksiyon almak ve stres altındaki personelin hata yapmasını engellemek için sıfır dikkat dağıtıcı unsur.
* **Özellikler:** Form doldurma işleminin olmadığı; siyah/koyu temalı, yüksek kontrastlı ekran. Ekranda gidilecek yönü gösteren basit bir harita ve sadece aktif görev yazar.
* **Kontroller:** 
  * 🟢 "Bölgeye Ulaşıldı"
  * 🔴 "Destek Ekip Lazım"
  * ⚪ "Hasar Yok / Görevi İptal Et"

## 🔄 Sistem Akışı ve Dinamik Görev Senaryosu
1. **T=0:** Deprem anında Ana Sunucu (`x.x.x.1`) AFAD/Kandilli'den ilk veriyi çeker.
2. **T+1sn:** Gemini API bölge verisini analiz ederek hasar skorlarını çıkarır ve görevleri veritabanına yazar.
3. **T+2sn:** Ağdaki saha cihazları, WebSockets üzerinden kendi bölgelerine ait görev listesini lokal veritabanlarına çeker.
4. **T+15dk:** Ekipler sahada enkaza ulaşır ve internet/ağ bağlantısı kopar.
5. **T+16dk:** Ekip, binanın sağlam olduğunu tespit eder ve tek tuşla "Hasar Yok" butonuna basar. Bu veri anında lokal belleğe kaydedilir; uygulama hata vermez.
6. **T+30dk:** Ekip tekrar kapsama alanına döner. Cihaz anında ana sunucuya bağlanarak senkronize olur, görevin iptal bilgisini iletir ve boşta kalan ekibe sistem havuzundan otomatik olarak yeni bir kırmızı aciliyetli görev atanır.
```
