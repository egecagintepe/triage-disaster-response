"""Pydantic schemas for Team API validation."""

from pydantic import BaseModel, Field, field_validator
import re
from typing import Optional
from datetime import datetime

# Blocks common SQL/XSS injection patterns in free-text fields
_INJECTION_RE = re.compile(
    r"(--|;|<script|</script|DROP\s+TABLE|INSERT\s+INTO|SELECT\s+.+\s+FROM|UNION\s+SELECT|xp_)",
    re.IGNORECASE,
)


class TeamCreate(BaseModel):
    device_ip: str = Field(..., max_length=15)
    device_id: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    status: str = Field(default="offline", pattern=r"^(offline|idle|busy)$")
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None

    @field_validator('name', mode='before')
    @classmethod
    def block_injection(cls, v: Optional[str]) -> Optional[str]:
        if v and _INJECTION_RE.search(v):
            raise ValueError('Input contains blocked characters or patterns')
        return v


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
    battery_level: Optional[int] = 100
    ping_ms: Optional[int] = 0
    is_online: Optional[bool] = False
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
