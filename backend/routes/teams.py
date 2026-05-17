"""Team CRUD endpoints – /api/v1/teams."""

from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.team import Team
from schemas.team import TeamCreate, TeamUpdate, TeamResponse

router = APIRouter(prefix="/api/v1/teams", tags=["teams"])


@router.get("", response_model=List[TeamResponse])
async def list_teams(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List all teams with optional status filter."""
    from main import ws_manager
    stmt = select(Team)
    if status:
        stmt = stmt.where(Team.status == status)
    stmt = stmt.order_by(Team.name)
    result = await db.execute(stmt)
    teams = result.scalars().all()
    
    response_list = []
    for team in teams:
        team_dict = team.__dict__.copy()
        # Active connections keys are device_id (string)
        team_dict["is_online"] = team.device_id in ws_manager.active_connections
        response_list.append(team_dict)
    return response_list


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(team_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single team by ID."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.post("", response_model=TeamResponse, status_code=201)
async def create_team(payload: TeamCreate, db: AsyncSession = Depends(get_db)):
    """Register a new team / field device."""
    team = Team(**payload.model_dump())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team


@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(team_id: int, payload: TeamUpdate, db: AsyncSession = Depends(get_db)):
    """Update team info (partial update)."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(team, field, value)
    team.last_seen = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=204)
async def delete_team(team_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a team."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await db.delete(team)
    await db.commit()
