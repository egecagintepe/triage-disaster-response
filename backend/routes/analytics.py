"""Analytics & Dashboard endpoints – /api/v1/analytics."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.task import Task
from models.team import Team
from models.zone import Zone

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/dashboard")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Aggregated dashboard statistics for the admin panel.

    Returns task counts by status, team availability, and zone breakdown.
    """
    # --- Task Stats ---
    total_tasks = (await db.execute(select(func.count(Task.id)))).scalar() or 0
    completed = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "resolved")
    )).scalar() or 0
    in_progress = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "in_progress")
    )).scalar() or 0
    pending = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "pending")
    )).scalar() or 0
    assigned = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "assigned")
    )).scalar() or 0
    needs_backup = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "needs_backup")
    )).scalar() or 0
    false_alarm = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "false_alarm")
    )).scalar() or 0

    # --- Task Priority Breakdown ---
    red_count = (await db.execute(
        select(func.count(Task.id)).where(Task.priority == "RED")
    )).scalar() or 0
    yellow_count = (await db.execute(
        select(func.count(Task.id)).where(Task.priority == "YELLOW")
    )).scalar() or 0
    green_count = (await db.execute(
        select(func.count(Task.id)).where(Task.priority == "GREEN")
    )).scalar() or 0

    # --- Team Stats ---
    active_teams = (await db.execute(
        select(func.count(Team.id)).where(Team.status == "busy")
    )).scalar() or 0
    idle_teams = (await db.execute(
        select(func.count(Team.id)).where(Team.status == "idle")
    )).scalar() or 0
    offline_teams = (await db.execute(
        select(func.count(Team.id)).where(Team.status == "offline")
    )).scalar() or 0

    # --- Zone Stats ---
    total_zones = (await db.execute(select(func.count(Zone.id)))).scalar() or 0

    # Zone priority breakdown
    critical_zones = (await db.execute(
        select(func.count(Zone.id)).where(Zone.priority_score >= 4.0)
    )).scalar() or 0
    high_zones = (await db.execute(
        select(func.count(Zone.id)).where(Zone.priority_score >= 3.0, Zone.priority_score < 4.0)
    )).scalar() or 0
    medium_zones = (await db.execute(
        select(func.count(Zone.id)).where(Zone.priority_score >= 2.0, Zone.priority_score < 3.0)
    )).scalar() or 0
    low_zones = (await db.execute(
        select(func.count(Zone.id)).where(Zone.priority_score < 2.0)
    )).scalar() or 0

    return {
        "total_tasks": total_tasks,
        "tasks_by_status": {
            "pending": pending,
            "assigned": assigned,
            "in_progress": in_progress,
            "needs_backup": needs_backup,
            "false_alarm": false_alarm,
            "resolved": completed,
        },
        "tasks_by_priority": {
            "RED": red_count,
            "YELLOW": yellow_count,
            "GREEN": green_count,
        },
        "teams": {
            "active": active_teams,
            "idle": idle_teams,
            "offline": offline_teams,
            "total": active_teams + idle_teams + offline_teams,
        },
        "zones": {
            "total": total_zones,
            "by_priority": {
                "critical": critical_zones,
                "high": high_zones,
                "medium": medium_zones,
                "low": low_zones,
            },
        },
    }


@router.get("/zones/{zone_id}/summary")
async def zone_summary(zone_id: int, db: AsyncSession = Depends(get_db)):
    """Get detailed task summary for a specific zone."""
    # Zone info
    zone_result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = zone_result.scalar_one_or_none()
    if not zone:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Zone not found")

    # Task counts for this zone
    total = (await db.execute(
        select(func.count(Task.id)).where(Task.zone_id == zone_id)
    )).scalar() or 0
    pending = (await db.execute(
        select(func.count(Task.id)).where(Task.zone_id == zone_id, Task.status == "pending")
    )).scalar() or 0
    completed = (await db.execute(
        select(func.count(Task.id)).where(Task.zone_id == zone_id, Task.status == "resolved")
    )).scalar() or 0
    in_progress = (await db.execute(
        select(func.count(Task.id)).where(Task.zone_id == zone_id, Task.status == "in_progress")
    )).scalar() or 0

    return {
        "zone_id": zone.id,
        "zone_name": zone.name,
        "priority_score": zone.priority_score,
        "total_tasks": total,
        "pending_tasks": pending,
        "in_progress_tasks": in_progress,
        "completed_tasks": completed,
        "completion_rate": round(completed / total * 100, 1) if total > 0 else 0,
    }
