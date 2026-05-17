import httpx
import asyncio

async def main():
    print("Kandilli API'den son 50 deprem verisi çekiliyor...")
    url = "https://api.orhanaydogdu.com.tr/deprem/kandilli/live?limit=50"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=10.0)
            data = response.json()
        except Exception as e:
            print(f"API'ye bağlanırken hata oluştu: {e}")
            return
            
        earthquakes = data.get("result", [])
        print(f"{len(earthquakes)} adet deprem bulundu. Sisteme enjekte ediliyor...\n")
        
        for i, eq in enumerate(earthquakes):
            coords = eq.get("geojson", {}).get("coordinates", [0, 0])
            if len(coords) < 2:
                continue
                
            lng = float(coords[0])
            lat = float(coords[1])
            mag = float(eq.get("mag", 0.0))
            depth = float(eq.get("depth", 0.0))
            city = eq.get("title", "Bilinmeyen")
            
            # API endpoint'in beklediği format
            payload = {
                "lat": lat,
                "lng": lng,
                "magnitude": mag,
                "depth": depth,
                "city": city
            }
            
            print(f"[{i+1}/{len(earthquakes)}] İşleniyor: M{mag} - {city}")
            try:
                # Arka planda çalışan FastAPI sunucumuzdaki debug endpointini çağırıyoruz
                res = await client.post(
                    "http://localhost:8000/api/v1/debug/inject-earthquake", 
                    json=payload,
                    timeout=60.0 # AI analizi biraz sürebilir
                )
                
                if res.status_code == 200:
                    result = res.json()
                    print(f"  ✓ Başarılı: {result['zones_created']} bölge, {result['tasks_created']} görev oluşturuldu. (AI: {result['method']})")
                else:
                    print(f"  ✗ Hata (HTTP {res.status_code}): {res.text}")
                    
            except Exception as e:
                print(f"  ✗ Hata: {e}")
            
            # Rate limiting ve sunucuyu yormamak için kısa bir bekleme süresi
            await asyncio.sleep(2)
            
    print("\nİşlem tamamlandı! Sağ taraftaki panele ve haritaya düşmüş olmaları gerekiyor.")

if __name__ == "__main__":
    asyncio.run(main())
