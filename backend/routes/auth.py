"""Authentication endpoints – /api/v1/auth."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.team import Team
from auth import create_access_token, require_auth

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# --- Schemas ---

class DeviceRegisterRequest(BaseModel):
    device_id: str = Field(..., max_length=50, description="Unique device identifier")
    device_name: str = Field(..., max_length=100, description="Human-readable device name")
    device_type: str = Field(
        default="field_mobile",
        pattern=r"^(field_mobile|admin_desktop)$",
        description="Device type: field_mobile or admin_desktop",
    )


class DeviceRegisterResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    device_id: str
    device_ip: Optional[str] = None
    role: str


class HeartbeatRequest(BaseModel):
    device_id: str = Field(..., max_length=50)
    lat: Optional[float] = None
    lng: Optional[float] = None
    battery_level: Optional[int] = Field(None, ge=0, le=100)


class HeartbeatResponse(BaseModel):
    status: str
    new_tasks_count: int = 0


# --- Endpoints ---

@router.post("/register-device", response_model=DeviceRegisterResponse)
async def register_device(payload: DeviceRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new device or re-authenticate an existing one.

    If the device_id already exists, a new token is issued.
    If not, a new team record is created and a token is returned.
    """
    # Check if device already exists
    result = await db.execute(select(Team).where(Team.device_id == payload.device_id))
    team = result.scalar_one_or_none()

    role = "admin" if payload.device_type == "admin_desktop" else "field_worker"

    if team is None:
        # Create a new team entry
        team = Team(
            device_id=payload.device_id,
            device_ip="0.0.0.0",  # Will be updated by heartbeat / network detection
            name=payload.device_name,
            status="idle",
        )
        db.add(team)
        await db.commit()
        await db.refresh(team)

    # Generate JWT
    token = create_access_token({
        "sub": payload.device_id,
        "role": role,
        "device_name": payload.device_name,
        "team_id": team.id,
    })

    return DeviceRegisterResponse(
        access_token=token,
        device_id=payload.device_id,
        device_ip=team.device_ip,
        role=role,
    )


@router.post("/heartbeat", response_model=HeartbeatResponse)
async def heartbeat(payload: HeartbeatRequest, db: AsyncSession = Depends(get_db)):
    """Device heartbeat – update location and last_seen timestamp.

    Returns count of new tasks assigned to this device since last heartbeat.
    """
    result = await db.execute(select(Team).where(Team.device_id == payload.device_id))
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(status_code=404, detail="Device not registered")

    # Update location and last_seen
    team.last_seen = datetime.now(timezone.utc)
    if payload.lat is not None:
        team.current_lat = payload.lat
    if payload.lng is not None:
        team.current_lng = payload.lng

    await db.commit()

    # Count new pending tasks assigned to this team
    from models.task import Task
    task_result = await db.execute(
        select(Task).where(
            Task.assigned_team_id == team.id,
            Task.status == "assigned",
        )
    )
    new_tasks = task_result.scalars().all()

    return HeartbeatResponse(
        status="ok",
        new_tasks_count=len(new_tasks),
    )


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(device: dict = Depends(require_auth)):
    """Refresh a valid JWT token.

    Accepts a still-valid Bearer token and issues a new one with a fresh
    expiration window. Used by the frontend 401 interceptor to silently
    rotate tokens before they expire.
    """
    new_token = create_access_token({
        "sub": device["device_id"],
        "role": device["role"],
        "device_name": device.get("device_name", ""),
    })
    return RefreshResponse(access_token=new_token)
