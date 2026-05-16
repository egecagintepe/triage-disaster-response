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

    for zone_analysis in analysis.get("zones", []):
        zone_name = zone_analysis["name"]
        score = zone_analysis["priority_score"]
        estimated_casualties = zone_analysis.get("estimated_casualties", 0)
        recommended_teams = zone_analysis.get("recommended_team_count", 1)
        risk_factors = zone_analysis.get("risk_factors", "")

        # Get coordinates from region data
        region = region_map.get(zone_name, {})
        zone_lat = region.get("lat", epicenter_lat + random.uniform(-0.05, 0.05))
        zone_lng = region.get("lng", epicenter_lng + random.uniform(-0.05, 0.05))

        # --- Create Zone record ---
        zone = Zone(
            name=zone_name,
            priority_score=score,
            geometry={
                "type": "Point",
                "coordinates": [zone_lng, zone_lat],
            },
            estimated_casualties=estimated_casualties,
            building_density=region.get("building_count", int(region.get("population_density", 5000) * 0.3)),
            population_density=region.get("population_density", 5000),
            infrastructure_risk=round(score * 0.8, 1),
        )
        session.add(zone)
        await session.flush()  # Get auto-generated ID

        zone_dict = {
            "id": zone.id,
            "name": zone.name,
            "priority_score": zone.priority_score,
            "estimated_casualties": zone.estimated_casualties,
            "lat": zone_lat,
            "lng": zone_lng,
            "recommended_teams": recommended_teams,
            "risk_factors": risk_factors,
        }
        zones_created.append(zone_dict)

        # --- Create Task records ---
        priority_class = classify_priority(score)
        building_types = ["residential", "commercial", "public", "industrial", "hospital"]
        damage_levels = _damage_levels_for_score(score)
        offsets = _generate_offsets(recommended_teams)

        for i in range(recommended_teams):
            lat_off, lng_off = offsets[i] if i < len(offsets) else (0.0, 0.0)

            task = Task(
                zone_id=zone.id,
                priority=priority_class,
                status="pending",
                lat=zone_lat + lat_off,
                lng=zone_lng + lng_off,
                address=f"{zone_name}, Bölge {i + 1}",
                building_type=building_types[i % len(building_types)],
                reported_damage_level=damage_levels[i % len(damage_levels)],
                notes=f"AI analiz: {risk_factors}" if risk_factors else f"AI tarafından oluşturuldu - {zone_name}",
            )
            session.add(task)
            await session.flush()

            tasks_created.append({
                "id": task.id,
                "zone_id": zone.id,
                "priority": task.priority,
                "status": task.status,
                "lat": task.lat,
                "lng": task.lng,
                "address": task.address,
                "building_type": task.building_type,
                "reported_damage_level": task.reported_damage_level,
                "notes": task.notes,
            })

    await session.commit()

    return {
        "zones_created": len(zones_created),
        "tasks_created": len(tasks_created),
        "zones": zones_created,
        "tasks": tasks_created,
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
