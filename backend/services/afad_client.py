"""AFAD/Kandilli earthquake data client.

Fetches earthquake data from Turkish disaster APIs.
Includes mock data for offline/testing scenarios.
"""

import json
from typing import Optional
from datetime import datetime, timezone

import httpx

from config import AFAD_API_URL


# --- Mock Data (for offline development & demos) ---

MOCK_EARTHQUAKE = {
    "earthquake_id": "MOCK-2024-001",
    "magnitude": 6.8,
    "depth_km": 12.0,
    "lat": 38.4192,
    "lng": 27.1287,
    "location": "İzmir, Bornova",
    "date": "2024-01-15T04:17:00Z",
    "source": "MOCK",
}

MOCK_ZONES = [
    {
        "id": 1,
        "name": "Bornova Merkez",
        "lat": 38.4622,
        "lng": 27.2176,
        "population_density": 12500,
        "old_building_ratio": 0.45,
        "distance_km": 5.2,
    },
    {
        "id": 2,
        "name": "Bayraklı",
        "lat": 38.4535,
        "lng": 27.1597,
        "population_density": 15000,
        "old_building_ratio": 0.62,
        "distance_km": 3.1,
    },
    {
        "id": 3,
        "name": "Karşıyaka",
        "lat": 38.4610,
        "lng": 27.1095,
        "population_density": 8900,
        "old_building_ratio": 0.38,
        "distance_km": 8.7,
    },
    {
        "id": 4,
        "name": "Konak",
        "lat": 38.4189,
        "lng": 27.1287,
        "population_density": 11200,
        "old_building_ratio": 0.55,
        "distance_km": 1.5,
    },
    {
        "id": 5,
        "name": "Çiğli",
        "lat": 38.5010,
        "lng": 27.0590,
        "population_density": 6200,
        "old_building_ratio": 0.22,
        "distance_km": 15.3,
    },
]


async def fetch_earthquake_data(earthquake_id: Optional[str] = None) -> dict:
    """Fetch earthquake data from AFAD API.

    Falls back to mock data if API is unreachable.

    Args:
        earthquake_id: Specific earthquake ID to fetch. If None, fetches latest.

    Returns:
        Earthquake data dict with magnitude, depth, coordinates, etc.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if earthquake_id:
                url = f"{AFAD_API_URL}/earthquakes/{earthquake_id}"
            else:
                url = f"{AFAD_API_URL}/earthquakes/latest"

            response = await client.get(url)
            response.raise_for_status()

            data = response.json()
            print(f"[AFAD] Fetched earthquake data: M{data.get('magnitude')}")
            return data

    except Exception as e:
        print(f"[AFAD] API unreachable ({e}), using mock data")
        return MOCK_EARTHQUAKE


async def fetch_zone_data() -> list[dict]:
    """Fetch regional zone data.

    In production, this would come from GIS databases or AFAD's zone API.
    For now, returns mock data representing İzmir districts.
    """
    # TODO: Integrate with real GIS data source
    return MOCK_ZONES


def generate_seed_data() -> dict:
    """Generate a complete seed dataset for development/demo.

    Returns:
        Dict with 'earthquake', 'zones', and 'tasks' keys.
    """
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

        zone_record = {
            "name": zone["name"],
            "priority_score": score,
            "geometry": {
                "type": "Point",
                "coordinates": [zone["lng"], zone["lat"]],
            },
            "estimated_casualties": int(zone["population_density"] * zone["old_building_ratio"] * 0.01),
            "building_density": int(zone["population_density"] * 0.3),
            "population_density": zone["population_density"],
            "infrastructure_risk": round(score * 0.8, 1),
        }
        zones_with_scores.append(zone_record)

        # Generate tasks per zone based on priority
        task_count = {5.0: 8, 4.0: 6, 3.0: 4, 2.0: 2, 1.0: 1}.get(
            round(score), 3
        )
        building_types = ["residential", "commercial", "public"]
        damage_levels = ["minor", "moderate", "severe", "collapsed"]

        for i in range(task_count):
            # Offset coordinates slightly for each task
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
