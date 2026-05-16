"""Pydantic schemas for Team API validation."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class TeamCreate(BaseModel):
    device_ip: str = Field(..., max_length=15)
    device_id: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    status: str = Field(default="offline", pattern=r"^(offline|idle|busy)$")
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = Field(None, pattern=r"^(offline|idle|busy)$")
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None


class TeamResponse(BaseModel):
    id: int
    device_ip: str
    device_id: str
    name: str
    status: str
    last_seen: Optional[datetime] = None
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
