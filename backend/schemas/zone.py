"""Pydantic schemas for Zone API validation."""

from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class ZoneCreate(BaseModel):
    name: str = Field(..., max_length=200)
    priority_score: float = Field(..., ge=1.0, le=5.0)
    geometry: Optional[Any] = None  # GeoJSON
    estimated_casualties: Optional[int] = None
    building_density: Optional[int] = None
    population_density: Optional[int] = None
    infrastructure_risk: Optional[float] = None


class ZoneUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    priority_score: Optional[float] = Field(None, ge=1.0, le=5.0)
    geometry: Optional[Any] = None
    estimated_casualties: Optional[int] = None
    building_density: Optional[int] = None
    population_density: Optional[int] = None
    infrastructure_risk: Optional[float] = None


class ZoneResponse(BaseModel):
    id: int
    name: str
    priority_score: float
    geometry: Optional[Any] = None
    estimated_casualties: Optional[int] = None
    building_density: Optional[int] = None
    population_density: Optional[int] = None
    infrastructure_risk: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
