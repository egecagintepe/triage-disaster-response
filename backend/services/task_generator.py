"""Task Generator — converts AI analysis output into Zone + Task records.

Takes the structured JSON from ai_engine (Gemini or fallback) and:
1. Creates Zone records in the database
2. Creates Task records with slight coordinate offsets per zone
3. Returns all created records for WebSocket broadcast

Reference: architecture.md Section 9.1
"""

import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from models.zone import Zone
from models.task import Task
from services.ai_engine import classify_priority


# Coordinate offset radius (~100m per task to avoid marker overlap)
OFFSET_STEP = 0.001


def _generate_offsets(count: int) -> List[Tuple[float, float]]:
    """Generate deterministic lat/lng offsets in a spiral pattern."""
    offsets = []
    for i in range(count):
        angle = i * 2.399  # golden angle in radians
        r = OFFSET_STEP * (i + 1) * 0.5
        lat_off = r * __import__("math").cos(angle)
        lng_off = r * __import__("math").sin(angle)
        offsets.append((lat_off, lng_off))
    return offsets


async def generate_from_analysis(
    session: AsyncSession,
    analysis: dict,
    earthquake_data: dict,
) -> Dict[str, Any]:
    """Create Zone + Task records from AI analysis output.

    Args:
        session: Async SQLAlchemy session.
        analysis: Output from analyze_with_gemini or generate_fallback_analysis.
                  Must have: {"zones": [{"name", "priority_score", "estimated_casualties", "recommended_team_count"}]}
        earthquake_data: Original earthquake data with affected_regions (for coordinates).

    Returns:
        Dict with created_zones, created_tasks, and summary stats.
    """
    zones_created = []
    tasks_created = []

    # Build region lookup for coordinates
    regions = earthquake_data.get("affected_regions", [])
    region_map = {r["name"]: r for r in regions}

    # Epicenter fallback
    epicenter_lat = earthquake_data.get("epicenter", {}).get("lat", earthquake_data.get("lat", 38.42))
    epicenter_lng = earthquake_data.get("epicenter", {}).get("lng", earthquake_data.get("lng", 27.13))

    # First pass: Create Zones and keep references
    zone_refs = {}
    for zone_analysis in analysis.get("zones", []):
        zone_name = zone_analysis["name"]
        score = zone_analysis.get("priority_score", 1.0)
        estimated_casualties = zone_analysis.get("estimated_casualties", 0)
        recommended_teams = zone_analysis.get("recommended_team_count", 1)
        risk_factors = zone_analysis.get("risk_factors", "")

        region = region_map.get(zone_name, {})
        zone_lat = zone_analysis.get("lat") or region.get("lat", epicenter_lat + random.uniform(-0.05, 0.05))
        zone_lng = zone_analysis.get("lng") or region.get("lng", epicenter_lng + random.uniform(-0.05, 0.05))
        radius_m = zone_analysis.get("radius_m", 500)

        polygon_coords_raw = zone_analysis.get("polygon_coordinates")

        # Fallback to hexagon if AI didn't provide coordinates
        if not polygon_coords_raw or not isinstance(polygon_coords_raw, list) or len(polygon_coords_raw) < 3:
            import math as _math
            hex_radius = radius_m / 111000.0  # Approx meters to degrees
            polygon_coords = []
            for angle_i in range(6):
                angle_rad = _math.radians(60 * angle_i - 30)
                hex_lat = zone_lat + hex_radius * _math.cos(angle_rad)
                hex_lng = zone_lng + hex_radius * _math.sin(angle_rad) / _math.cos(_math.radians(zone_lat))
                polygon_coords.append([hex_lng, hex_lat]) # GeoJSON is [lng, lat]
            polygon_coords.append(polygon_coords[0])
        else:
            # AI gives [lat, lng], swap to [lng, lat] for GeoJSON
            polygon_coords = [[p[1], p[0]] for p in polygon_coords_raw]
            # Ensure it's closed
            if polygon_coords[0] != polygon_coords[-1]:
                polygon_coords.append(polygon_coords[0])

        zone = Zone(
            name=zone_name,
            priority_score=score,
            geometry={
                "type": "Polygon",
                "coordinates": [polygon_coords],
            },
            estimated_casualties=estimated_casualties,
            building_density=region.get("building_count", int(region.get("population_density", 5000) * 0.3)),
            population_density=region.get("population_density", 5000),
            infrastructure_risk=round(score * 0.8, 1),
        )
        session.add(zone)
        await session.flush()

        zone_refs[zone_name] = {
            "id": zone.id,
            "score": score,
            "lat": zone_lat,
            "lng": zone_lng,
            "recommended_teams": recommended_teams,
            "risk_factors": risk_factors
        }

        zones_created.append({
            "id": zone.id,
            "name": zone.name,
            "priority_score": zone.priority_score,
            "estimated_casualties": zone.estimated_casualties,
            "lat": zone_lat,
            "lng": zone_lng,
            "recommended_teams": recommended_teams,
            "risk_factors": risk_factors,
        })

    # Second pass: Create Tasks
    ai_tasks = analysis.get("tasks", [])
    
    if ai_tasks:
        # Use AI-generated explicit tasks
        offsets = _generate_offsets(len(ai_tasks) + 10)
        for idx, t_data in enumerate(ai_tasks):
            z_name = t_data.get("zone_name")
            z_ref = zone_refs.get(z_name)
            if not z_ref:
                continue
                
            lat_off, lng_off = offsets[idx % len(offsets)]
            
            task = Task(
                zone_id=z_ref["id"],
                priority=t_data.get("priority", "YELLOW").upper(),
                status="pending_approval",
                lat=z_ref["lat"] + lat_off,
                lng=z_ref["lng"] + lng_off,
                address=f"{z_name} - {t_data.get('action_type', 'Müdahale')}",
                building_type="unknown",
                notes=t_data.get("description", ""),
            )
            session.add(task)
            await session.flush()
            tasks_created.append(_format_task_dict(task))
    else:
        # Fallback to algorithmic tasks
        for zone_name, z_ref in zone_refs.items():
            priority_class = classify_priority(z_ref["score"])
            building_types = ["residential", "commercial", "public", "industrial", "hospital"]
            damage_levels = _damage_levels_for_score(z_ref["score"])
            offsets = _generate_offsets(z_ref["recommended_teams"])

            for i in range(min(3, z_ref["recommended_teams"])):
                lat_off, lng_off = offsets[i] if i < len(offsets) else (0.0, 0.0)

                task = Task(
                    zone_id=z_ref["id"],
                    priority=priority_class,
                    status="pending_approval",
                    lat=z_ref["lat"] + lat_off,
                    lng=z_ref["lng"] + lng_off,
                    address=f"{zone_name}, Bölge {i + 1}",
                    building_type=building_types[i % len(building_types)],
                    reported_damage_level=damage_levels[i % len(damage_levels)],
                    notes=f"AI analiz: {z_ref['risk_factors']}" if z_ref['risk_factors'] else f"AI tarafından oluşturuldu - {zone_name}",
                )
                session.add(task)
                await session.flush()
                tasks_created.append(_format_task_dict(task))

    await session.commit()

    return {
        "zones_created": len(zones_created),
        "tasks_created": len(tasks_created),
        "zones": zones_created,
        "tasks": tasks_created,
    }


def _format_task_dict(task: Task) -> dict:
    return {
        "id": task.id,
        "zone_id": task.zone_id,
        "priority": task.priority,
        "status": task.status,
        "lat": task.lat,
        "lng": task.lng,
        "address": task.address,
        "building_type": task.building_type,
        "reported_damage_level": task.reported_damage_level,
        "notes": task.notes,
    }

def _damage_levels_for_score(score: float) -> list[str]:
    """Return likely damage levels based on zone priority score."""
    if score >= 4.0:
        return ["severe", "collapsed", "severe", "collapsed"]
    elif score >= 3.0:
        return ["moderate", "severe", "moderate", "severe"]
    elif score >= 2.0:
        return ["minor", "moderate", "minor"]
    else:
        return ["minor", "minor"]
