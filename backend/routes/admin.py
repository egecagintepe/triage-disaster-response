"""Admin endpoints – /api/v1/admin.

Operations for earthquake data fetching, AI analysis, and data seeding.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.zone import Zone
from models.task import Task
from models.system_event import SystemEvent
from services.afad_client import fetch_earthquake_data, fetch_zone_data, generate_seed_data
from services.ai_engine import (
    analyze_with_gemini,
    calculate_priority_score_fallback,
    classify_priority,
    estimate_team_count,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# --- Schemas ---

class FetchAFADRequest(BaseModel):
    earthquake_id: Optional[str] = None
    force_refresh: bool = False


class RunAIAnalysisRequest(BaseModel):
    zone_ids: List[int] = Field(default_factory=list, description="Empty = all zones")
    force_rerun: bool = False


class SeedDataRequest(BaseModel):
    clear_existing: bool = Field(default=True, description="Delete existing data before seeding")


# --- Endpoints ---

@router.post("/fetch-afad-data")
async def fetch_afad_data(payload: FetchAFADRequest, db: AsyncSession = Depends(get_db)):
    """Fetch earthquake data from AFAD/Kandilli API (or mock).

    Creates zones from the fetched data if they don't exist.
    """
    # Fetch earthquake data
    earthquake = await fetch_earthquake_data(payload.earthquake_id)

    # Log system event
    event = SystemEvent(
        event_type="api_fetch",
        description=f"Deprem verisi çekildi: M{earthquake.get('magnitude')} - {earthquake.get('location')}",
        metadata_=str(earthquake),
    )
    db.add(event)
    await db.commit()

    return {
        "status": "ok",
        "earthquake": earthquake,
        "message": "Deprem verisi başarıyla çekildi",
    }


@router.post("/run-ai-analysis")
async def run_ai_analysis(payload: RunAIAnalysisRequest, db: AsyncSession = Depends(get_db)):
    """Run AI analysis on zones to generate/update priority scores.

    Uses Gemini API if available, falls back to rule-based scoring.
    """
    # Get zones to analyze
    if payload.zone_ids:
        stmt = select(Zone).where(Zone.id.in_(payload.zone_ids))
    else:
        stmt = select(Zone)

    result = await db.execute(stmt)
    zones = result.scalars().all()

    if not zones:
        raise HTTPException(status_code=404, detail="No zones found to analyze")

    # Fetch earthquake context
    earthquake = await fetch_earthquake_data()
    zone_data = await fetch_zone_data()

    # Try Gemini first
    zones_dict = [{"id": z.id, "name": z.name, "population_density": z.population_density or 0} for z in zones]
    ai_result = await analyze_with_gemini(earthquake, zones_dict)

    updated_zones = []

    if ai_result and "zones" in ai_result:
        # Use AI results
        for ai_zone in ai_result["zones"]:
            zone_id = ai_zone.get("zone_id")
            for zone in zones:
                if zone.id == zone_id:
                    zone.priority_score = ai_zone.get("priority_score", zone.priority_score)
                    if ai_zone.get("estimated_casualties"):
                        zone.estimated_casualties = ai_zone["estimated_casualties"]
                    if ai_zone.get("infrastructure_risk"):
                        zone.infrastructure_risk = ai_zone["infrastructure_risk"]
                    updated_zones.append({"id": zone.id, "name": zone.name, "score": zone.priority_score})
                    break
        analysis_method = "gemini"
    else:
        # Fallback: rule-based scoring
        for zone in zones:
            # Find matching zone data for distance
            zone_info = next((z for z in zone_data if z["name"] == zone.name), None)
            distance = zone_info["distance_km"] if zone_info else 50.0

            score = calculate_priority_score_fallback(
                magnitude=earthquake.get("magnitude", 5.0),
                depth_km=earthquake.get("depth_km", 20.0),
                distance_km=distance,
                population_density=zone.population_density or 5000,
                old_building_ratio=0.4,
            )
            zone.priority_score = score
            updated_zones.append({"id": zone.id, "name": zone.name, "score": score})
        analysis_method = "fallback_rules"

    await db.commit()

    # Log system event
    event = SystemEvent(
        event_type="ai_analysis",
        description=f"AI analiz tamamlandı ({analysis_method}): {len(updated_zones)} bölge güncellendi",
    )
    db.add(event)
    await db.commit()

    return {
        "status": "completed",
        "analysis_method": analysis_method,
        "zones_updated": len(updated_zones),
        "results": updated_zones,
    }


@router.post("/seed-data")
async def seed_data(payload: SeedDataRequest, db: AsyncSession = Depends(get_db)):
    """Seed the database with realistic demo data.

    Uses the fallback scoring algorithm to create zones and tasks
    based on a mock İzmir earthquake scenario.
    """
    if payload.clear_existing:
        # Clear in correct order (foreign keys)
        await db.execute(delete(Task))
        await db.execute(delete(Zone))
        await db.commit()

    # Generate seed data
    seed = generate_seed_data()

    # Insert zones
    created_zones = []
    zone_id_map = {}  # old_id → new_id

    for i, zone_data in enumerate(seed["zones"], start=1):
        zone = Zone(**zone_data)
        db.add(zone)
        await db.flush()  # Get the ID
        zone_id_map[i] = zone.id
        created_zones.append({"id": zone.id, "name": zone.name, "score": zone.priority_score})

    # Insert tasks with corrected zone_ids
    created_tasks = 0
    for task_data in seed["tasks"]:
        old_zone_id = task_data["zone_id"]
        task_data["zone_id"] = zone_id_map.get(old_zone_id, old_zone_id)
        task = Task(**task_data)
        db.add(task)
        created_tasks += 1

    await db.commit()

    # Log event
    event = SystemEvent(
        event_type="seed_data",
        description=f"Demo veri yüklendi: {len(created_zones)} bölge, {created_tasks} görev",
    )
    db.add(event)
    await db.commit()

    return {
        "status": "ok",
        "zones_created": len(created_zones),
        "tasks_created": created_tasks,
        "zones": created_zones,
        "earthquake": seed["earthquake"],
    }


@router.get("/system-events")
async def list_system_events(
    limit: int = 50,
    event_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List recent system events (audit log)."""
    stmt = select(SystemEvent)
    if event_type:
        stmt = stmt.where(SystemEvent.event_type == event_type)
    stmt = stmt.order_by(SystemEvent.created_at.desc()).limit(limit)

    result = await db.execute(stmt)
    events = result.scalars().all()

    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "description": e.description,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]
