"""Pydantic schemas for Task API validation."""

from pydantic import BaseModel, Field, field_validator
import re
from typing import Optional
from datetime import datetime

# Blocks common SQL/XSS injection patterns in free-text fields
_INJECTION_RE = re.compile(
    r"(--|;|<script|</script|DROP\s+TABLE|INSERT\s+INTO|SELECT\s+.+\s+FROM|UNION\s+SELECT|xp_)",
    re.IGNORECASE,
)


class TaskCreate(BaseModel):
    zone_id: int
    priority: str = Field(..., pattern=r"^(RED|YELLOW|GREEN)$")
    lat: float
    lng: float
    address: Optional[str] = Field(None, max_length=300)
    building_type: Optional[str] = None
    reported_damage_level: Optional[str] = None
    assigned_team_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator('address', 'notes', 'building_type', mode='before')
    @classmethod
    def block_injection(cls, v: Optional[str]) -> Optional[str]:
        if v and _INJECTION_RE.search(v):
            raise ValueError('Input contains blocked characters or patterns')
        return v


class TaskUpdate(BaseModel):
    status: Optional[str] = Field(
        None,
        pattern=r"^(pending|assigned|in_progress|needs_backup|false_alarm|resolved)$",
    )
    assigned_team_id: Optional[int] = None
    priority: Optional[str] = Field(None, pattern=r"^(RED|YELLOW|GREEN)$")
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator('notes', mode='before')
    @classmethod
    def block_injection(cls, v: Optional[str]) -> Optional[str]:
        if v and _INJECTION_RE.search(v):
            raise ValueError('Input contains blocked characters or patterns')
        return v
    local_updated_at: Optional[int] = None  # Unix timestamp from client


class TaskResponse(BaseModel):
    id: int
    zone_id: int
    assigned_team_id: Optional[int] = None
    status: str
    priority: str
    lat: float
    lng: float
    address: Optional[str] = None
    building_type: Optional[str] = None
    reported_damage_level: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    local_updated_at: Optional[datetime] = None
    assigned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}
