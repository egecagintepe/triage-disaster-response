"""Earthquake data client — live Kandilli Observatory + simulated impact zones.

Flow:
1. fetch_latest_earthquake() → async GET to Kandilli community API
2. Real data: magnitude, depth, coordinates, location from live API
3. Simulated: affected_regions generated around real epicenter (30km radius)
4. Fallback: MOCK_EARTHQUAKE if API unreachable
"""

import math
import random
from typing import Optional
from datetime import datetime, timezone

import httpx

from config import AFAD_API_URL

# Kandilli community API (live earthquake data)
KANDILLI_API_URL = "https://api.orhanaydogdu.com.tr/deprem/kandilli/live"

_earthquake_window = []


# --- Simulated Impact Zone Generator ---

# Realistic Turkish district names for impact zones relative to epicenter
_DISTRICT_TEMPLATES = [
    ("Merkez", 0.0, 0.0),
    ("Kuzey Bölge", 0.04, 0.01),
    ("Güney Bölge", -0.04, -0.01),
    ("Doğu Bölge", 0.01, 0.04),
    ("Batı Bölge", 0.01, -0.04),
]


def _generate_affected_regions(
    epicenter_lat: float,
    epicenter_lng: float,
    magnitude: float,
    location_name: str,
    closest_cities: list,
) -> list:
    """Generate simulated affected_regions around a real epicenter.

    Uses closest city data from Kandilli API when available.
    Falls back to template-based generation otherwise.
    """
    regions = []

    if closest_cities and len(closest_cities) >= 3:
        # Use real city data from Kandilli API
        for i, city in enumerate(closest_cities[:5]):
            distance_km = city.get("distance", 0) / 1000  # API gives meters
            population = city.get("population", 100000) or 100000
            name = city.get("name", f"Bölge {i+1}")

            # Estimate building and risk data from magnitude + distance
            pop_density = int(population / max(distance_km, 1) * 0.5)
            pop_density = min(pop_density, 20000)  # Cap at realistic max
            old_ratio = max(0.15, min(0.7, 0.6 - distance_km * 0.01))

            # Calculate lat/lng from epicenter + bearing
            angle = (i * 72) * math.pi / 180  # Spread evenly
            offset_lat = math.sin(angle) * distance_km * 0.009
            offset_lng = math.cos(angle) * distance_km * 0.009

            regions.append({
                "name": name,
                "lat": round(epicenter_lat + offset_lat, 4),
                "lng": round(epicenter_lng + offset_lng, 4),
                "population": population,
                "building_count": int(population * 0.12),
                "old_building_ratio": round(old_ratio, 2),
                "distance_to_epicenter_km": round(distance_km, 1),
                "population_density": pop_density,
                "soil_type": random.choice(["soft", "medium", "hard"]),
            })
    else:
        # Template fallback — generate zones around epicenter
        impact_radius_km = min(magnitude * 5, 30)

        for i, (suffix, dlat, dlng) in enumerate(_DISTRICT_TEMPLATES):
            distance_km = math.sqrt(dlat**2 + dlng**2) * 111  # rough deg→km
            if i == 0:
                distance_km = 0.5  # Merkez

            scale = max(0.3, 1.0 - distance_km / impact_radius_km)
            pop_density = int(8000 * scale + random.randint(1000, 5000))
            old_ratio = round(max(0.15, 0.55 * scale + random.uniform(0, 0.1)), 2)

            regions.append({
                "name": f"{location_name} {suffix}",
                "lat": round(epicenter_lat + dlat, 4),
                "lng": round(epicenter_lng + dlng, 4),
                "population": int(pop_density * random.randint(20, 40)),
                "building_count": int(pop_density * random.randint(3, 6)),
                "old_building_ratio": old_ratio,
                "distance_to_epicenter_km": round(distance_km, 1),
                "population_density": pop_density,
                "soil_type": random.choice(["soft", "medium", "hard"]),
            })

    return regions


# --- Mock Data (fallback when API unreachable) ---

MOCK_EARTHQUAKE = {
    "earthquake_id": "MOCK-2024-001",
    "magnitude": 6.8,
    "depth_km": 12.0,
    "epicenter": {"lat": 38.4192, "lng": 27.1287},
    "lat": 38.4192,
    "lng": 27.1287,
    "location": "İzmir, Bornova",
    "date": "2024-01-15T04:17:00Z",
    "source": "MOCK",
    "affected_regions": [
        {
            "name": "Bayraklı", "lat": 38.4535, "lng": 27.1597,
            "population": 315000, "building_count": 42000,
            "old_building_ratio": 0.62, "distance_to_epicenter_km": 3.1,
            "population_density": 15000, "soil_type": "soft",
        },
        {
            "name": "Konak", "lat": 38.4189, "lng": 27.1287,
            "population": 390000, "building_count": 55000,
            "old_building_ratio": 0.55, "distance_to_epicenter_km": 1.5,
            "population_density": 11200, "soil_type": "medium",
        },
        {
            "name": "Bornova Merkez", "lat": 38.4622, "lng": 27.2176,
            "population": 450000, "building_count": 85000,
            "old_building_ratio": 0.45, "distance_to_epicenter_km": 5.2,
            "population_density": 12500, "soil_type": "medium",
        },
        {
            "name": "Karşıyaka", "lat": 38.4610, "lng": 27.1095,
            "population": 340000, "building_count": 48000,
            "old_building_ratio": 0.38, "distance_to_epicenter_km": 8.7,
            "population_density": 8900, "soil_type": "hard",
        },
        {
            "name": "Çiğli", "lat": 38.5010, "lng": 27.0590,
            "population": 210000, "building_count": 32000,
            "old_building_ratio": 0.22, "distance_to_epicenter_km": 15.3,
            "population_density": 6200, "soil_type": "hard",
        },
    ],
}

# Legacy flat zone list (kept for backward compat with generate_seed_data)
MOCK_ZONES = [
    {
        "id": i + 1,
        "name": r["name"],
        "lat": r["lat"],
        "lng": r["lng"],
        "population_density": r["population_density"],
        "old_building_ratio": r["old_building_ratio"],
        "distance_km": r["distance_to_epicenter_km"],
    }
    for i, r in enumerate(MOCK_EARTHQUAKE["affected_regions"])
]


# --- API Functions ---

async def fetch_latest_earthquake() -> dict:
    """Fetch the most recent earthquake from multiple sources (Kandilli, USGS, EMSC).
    Merges and deduplicates events within 10km.
    Falls back to MOCK_EARTHQUAKE if APIs unreachable.
    """
    from services.seismology import calculate_rupture_length, predict_aftershocks
    events = []

    # 1. Fetch Kandilli
    def in_turkey(lat: float, lng: float) -> bool:
        # STRICT Turkey bounding box — anything outside is silently dropped
        return 35.0 <= lat <= 43.0 and 25.0 <= lng <= 45.0

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(KANDILLI_API_URL)
            data = res.json().get("result", [])
            if data:
                eq = data[0]
                coords = eq.get("geojson", {}).get("coordinates", [0, 0])
                lat = float(coords[1])
                lng = float(coords[0])
                if in_turkey(lat, lng):
                    title = eq.get("title", "Bilinmeyen")
                    events.append({
                        "id": eq.get("earthquake_id", f"KANDILLI-{eq.get('date_time', '')}"),
                        "mag": float(eq.get("mag", 0.0)),
                        "depth": float(eq.get("depth", 0.0)),
                        "lat": lat,
                        "lng": lng,
                        "title": title,
                        "date": eq.get("date_time", ""),
                        "source": "AFAD/Kandilli",
                        "closestCities": eq.get("location_properties", {}).get("closestCities", [])
                    })
    except Exception as e:
        print(f"[KANDILLI] API error: {e}")

    # USGS and EMSC removed

    if not events:
        print("[ALL] No earthquake results, using mock")
        return MOCK_EARTHQUAKE

    # Sort events by date descending
    events.sort(key=lambda x: x["date"], reverse=True)
    
    # Deduplicate (within 10km)
    merged = []
    for ev in events:
        is_dup = False
        for m in merged:
            dist = math.sqrt((ev["lat"] - m["lat"])**2 + (ev["lng"] - m["lng"])**2) * 111
            if dist < 10.0:
                is_dup = True
                break
        if not is_dup:
            merged.append(ev)

    best_eq = merged[0] if merged else events[0]

    # FINAL strict Turkey guardrail — ironclad check before building the result
    if not (35.0 <= best_eq["lat"] <= 43.0 and 25.0 <= best_eq["lng"] <= 45.0):
        print(f"[FILTER] Dropped earthquake outside Turkey: {best_eq['title']} ({best_eq['lat']:.4f}, {best_eq['lng']:.4f})")
        return {}
    
    magnitude = best_eq["mag"]
    lat = best_eq["lat"]
    lng = best_eq["lng"]
    
    earthquake = {
        "earthquake_id": best_eq["id"],
        "magnitude": magnitude,
        "depth_km": best_eq["depth"],
        "epicenter": {"lat": lat, "lng": lng},
        "lat": lat,
        "lng": lng,
        "location": best_eq["title"],
        "date": best_eq["date"],
        "source": best_eq["source"],
        "rupture_length_km": calculate_rupture_length(magnitude),
        "estimated_aftershocks": predict_aftershocks(time_since_mainshock_hours=6.0, base_count=15, magnitude=magnitude),
        "affected_regions": _generate_affected_regions(
            lat, lng, magnitude, best_eq["title"], best_eq["closestCities"],
        ),
    }

    # Rolling Window of 50 — strict deduplication by ID, newest first
    global _earthquake_window
    eq_id_str = str(earthquake["earthquake_id"])
    if not any(str(e["earthquake_id"]) == eq_id_str for e in _earthquake_window):
        _earthquake_window.insert(0, earthquake)
        # Trim to exactly 50 unique events
        _earthquake_window = _earthquake_window[:50]

    print(
        f"[POLL] Live earthquake: M{magnitude} {best_eq['title']} "
        f"({lat:.4f}, {lng:.4f}) depth={best_eq['depth']}km | Source: {best_eq['source']}"
    )
    return earthquake


async def fetch_earthquake_data(earthquake_id: Optional[str] = None) -> dict:
    """Fetch earthquake data. Delegates to fetch_latest_earthquake."""
    return await fetch_latest_earthquake()


async def fetch_zone_data() -> list[dict]:
    """Fetch regional zone data (mock for backward compat)."""
    return MOCK_ZONES


def generate_seed_data() -> dict:
    """Generate a complete seed dataset for development/demo."""
    from services.ai_engine import calculate_priority_score_fallback, classify_priority

    earthquake = MOCK_EARTHQUAKE.copy()

    zones_with_scores = []
    tasks = []
    task_id = 1

    for zone in MOCK_ZONES:
        score = calculate_priority_score_fallback(
            magnitude=earthquake["magnitude"],
            depth_km=earthquake["depth_km"],
            distance_km=zone["distance_km"],
            population_density=zone["population_density"],
            old_building_ratio=zone["old_building_ratio"],
        )
        priority_class = classify_priority(score)

        # Generate a small polygon around the center for demo
        r = 0.005 # approx 500m radius
        polygon_coords = [
            [zone["lng"], zone["lat"] + r],
            [zone["lng"] + r, zone["lat"]],
            [zone["lng"], zone["lat"] - r],
            [zone["lng"] - r, zone["lat"]],
            [zone["lng"], zone["lat"] + r] # close polygon
        ]
        
        zone_record = {
            "name": zone["name"],
            "priority_score": score,
            "geometry": {
                "type": "Polygon",
                "coordinates": [polygon_coords],
            },
            "estimated_casualties": int(zone["population_density"] * zone["old_building_ratio"] * 0.01),
            "building_density": int(zone["population_density"] * 0.3),
            "population_density": zone["population_density"],
            "infrastructure_risk": round(score * 0.8, 1),
        }
        zones_with_scores.append(zone_record)

        task_count = {5.0: 8, 4.0: 6, 3.0: 4, 2.0: 2, 1.0: 1}.get(
            round(score), 3
        )
        building_types = ["residential", "commercial", "public"]
        damage_levels = ["minor", "moderate", "severe", "collapsed"]

        for i in range(task_count):
            offset_lat = (i * 0.001) - (task_count * 0.0005)
            offset_lng = (i * 0.0008) - (task_count * 0.0004)

            damage_idx = min(i % len(damage_levels), len(damage_levels) - 1)
            if score >= 4.0:
                damage_idx = min(damage_idx + 2, len(damage_levels) - 1)

            tasks.append({
                "zone_id": zone["id"],
                "priority": priority_class,
                "lat": zone["lat"] + offset_lat,
                "lng": zone["lng"] + offset_lng,
                "address": f"{zone['name']}, Sokak No:{task_id}",
                "building_type": building_types[i % len(building_types)],
                "reported_damage_level": damage_levels[damage_idx],
                "notes": f"AI tarafından oluşturuldu - Bölge: {zone['name']}",
            })
            task_id += 1

    return {
        "earthquake": earthquake,
        "zones": zones_with_scores,
        "tasks": tasks,
    }
