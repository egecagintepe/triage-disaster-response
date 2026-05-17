"""Task (core operational entity) model."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=False)
    assigned_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    status = Column(String(30), default="pending")
    # status values: pending, assigned, in_progress, needs_backup, false_alarm, resolved
    priority = Column(String(10), nullable=False)  # RED, YELLOW, GREEN
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    address = Column(String(300), nullable=True)
    building_type = Column(String(50), nullable=True)  # residential, commercial, public
    reported_damage_level = Column(String(30), nullable=True)  # minor, moderate, severe, collapsed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    local_updated_at = Column(DateTime, nullable=True)  # Client timestamp for conflict resolution
    assigned_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    notes = Column(String(500), nullable=True)
