"""Audit / logging models: TaskHistory, SyncLog, SystemEvent."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from database import Base


class TaskHistory(Base):
    __tablename__ = "task_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    previous_status = Column(String(30), nullable=True)
    new_status = Column(String(30), nullable=False)
    changed_by_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    changed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    notes = Column(String(500), nullable=True)


class SyncLog(Base):
    __tablename__ = "sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(50), nullable=False)
    sync_type = Column(String(20), nullable=True)  # push, pull, conflict
    entity_type = Column(String(30), nullable=True)  # task, team, zone
    entity_id = Column(Integer, nullable=True)
    data_snapshot = Column(String, nullable=True)  # JSON string
    synced_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SystemEvent(Base):
    __tablename__ = "system_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(50), nullable=False)  # api_fetch, ai_analysis, error
    description = Column(String(500), nullable=True)
    metadata_ = Column("metadata", String, nullable=True)  # JSON string
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
