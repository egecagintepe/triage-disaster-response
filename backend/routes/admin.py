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
from services.afad_client import fetch_latest_earthquake, fetch_earthquake_data, fetch_zone_data, generate_seed_data
from services.ai_engine import (
    analyze_with_gemini,
    generate_fallback_analysis,
    calculate_priority_score_fallback,
    classify_priority,
    estimate_team_count,
)
from services.task_generator import generate_from_analysis
from services.dispatcher import assign_pending_tasks, broadcast_assignments

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


# --- Helper: get ws_manager from main module ---

def _get_ws_manager():
    """Import ws_manager lazily to avoid circular imports."""
    from main import ws_manager
    return ws_manager


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
    """Full AI analysis orchestration:

    1. Fetch AFAD earthquake data (mock)
    2. Pass to Gemini AI Engine (or fallback)
    3. Pass to Task Generator (Zone + Task creation)
    4. Commit to DB
    5. Broadcast new tasks via WebSocket

    Returns created zones, tasks, and analysis method used.
    """
    # --- Step 1: Fetch earthquake data ---
    earthquake = await fetch_latest_earthquake()
    print(f"[AI-FLOW] Earthquake: M{earthquake.get('magnitude')} at {earthquake.get('location')}")

    # --- Step 2: AI Analysis (Gemini or fallback) ---
    affected_regions = earthquake.get("affected_regions", [])
    ai_result = await analyze_with_gemini(earthquake, affected_regions)

    if ai_result and "zones" in ai_result:
        analysis_method = "gemini"
        analysis = ai_result
        print(f"[AI-FLOW] Gemini analysis: {len(analysis['zones'])} zones")
    else:
        analysis_method = "fallback_rules"
        analysis = generate_fallback_analysis(earthquake)
        print(f"[AI-FLOW] Fallback analysis: {len(analysis['zones'])} zones")

    # --- Step 3: Generate Zone + Task records ---
    result = await generate_from_analysis(db, analysis, earthquake)

    # --- Step 4: Log system event ---
    event = SystemEvent(
        event_type="ai_analysis",
        description=(
            f"AI analiz tamamlandı ({analysis_method}): "
            f"{result['zones_created']} bölge, {result['tasks_created']} görev oluşturuldu"
        ),
    )
    db.add(event)
    await db.commit()

    # --- Step 5: WebSocket broadcast ---
    try:
        ws = _get_ws_manager()

        # Broadcast summary event
        await ws.broadcast({
            "type": "BROADCAST",
            "message": (
                f"🚨 AI ANALİZ TAMAMLANDI: M{earthquake.get('magnitude')} {earthquake.get('location')} — "
                f"{result['zones_created']} bölge, {result['tasks_created']} görev oluşturuldu"
            ),
        })

        # Broadcast each new task individually for real-time map updates
        for task_data in result.get("tasks", []):
            await ws.broadcast({
                "type": "NEW_TASK",
                "data": task_data,
            })

        print(f"[AI-FLOW] Broadcast {result['tasks_created']} tasks to all devices")
    except Exception as e:
        print(f"[AI-FLOW] WebSocket broadcast failed (non-fatal): {e}")

    # --- Step 6: Auto-assign tasks to idle teams ---
    assignments = await assign_pending_tasks(db)
    if assignments:
        await broadcast_assignments(assignments)
        print(f"[AI-FLOW] Auto-assigned {len(assignments)} tasks to teams")

    return {
        "status": "completed",
        "analysis_method": analysis_method,
        "earthquake": {
            "magnitude": earthquake.get("magnitude"),
            "location": earthquake.get("location"),
            "depth_km": earthquake.get("depth_km"),
        },
        "zones_created": result["zones_created"],
        "tasks_created": result["tasks_created"],
        "tasks_assigned": len(assignments),
        "zones": result["zones"],
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

    # Broadcast via WebSocket
    try:
        ws = _get_ws_manager()
        await ws.broadcast({
            "type": "BROADCAST",
            "message": f"📊 Demo veri yüklendi: {len(created_zones)} bölge, {created_tasks} görev",
        })
    except Exception:
        pass

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
