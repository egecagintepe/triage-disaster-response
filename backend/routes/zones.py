"""Zone CRUD endpoints – /api/v1/zones."""

from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.zone import Zone
from schemas.zone import ZoneCreate, ZoneUpdate, ZoneResponse

router = APIRouter(prefix="/api/v1/zones", tags=["zones"])


@router.get("", response_model=List[ZoneResponse])
async def list_zones(
    min_priority: Optional[float] = Query(None, ge=1.0, le=5.0),
    db: AsyncSession = Depends(get_db),
):
    """List all zones, optionally filtered by minimum priority score."""
    stmt = select(Zone)
    if min_priority is not None:
        stmt = stmt.where(Zone.priority_score >= min_priority)
    stmt = stmt.order_by(Zone.priority_score.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single zone by ID."""
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return zone


@router.post("", response_model=ZoneResponse, status_code=201)
async def create_zone(payload: ZoneCreate, db: AsyncSession = Depends(get_db)):
    """Create a new zone."""
    zone = Zone(**payload.model_dump())
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    
    try:
        from main import ws_manager
        from schemas.zone import ZoneResponse
        await ws_manager.broadcast({
            "type": "ZONE_UPDATE",
            "data": ZoneResponse.model_validate(zone).model_dump()
        })
    except Exception:
        pass

    return zone


@router.patch("/{zone_id}", response_model=ZoneResponse)
async def update_zone(zone_id: int, payload: ZoneUpdate, db: AsyncSession = Depends(get_db)):
    """Update a zone (partial update)."""
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(zone, field, value)
    zone.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(zone)

    try:
        from main import ws_manager
        from schemas.zone import ZoneResponse
        await ws_manager.broadcast({
            "type": "ZONE_UPDATE",
            "data": ZoneResponse.model_validate(zone).model_dump()
        })
    except Exception:
        pass

    return zone


@router.delete("/{zone_id}", status_code=204)
async def delete_zone(zone_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a zone."""
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    await db.delete(zone)
    await db.commit()
