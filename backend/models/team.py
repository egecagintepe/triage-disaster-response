"""Team (field device / rescue unit) model."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime
from database import Base


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_ip = Column(String(15), nullable=False)
    device_id = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    status = Column(String(20), default="offline")  # offline, idle, busy
    last_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    battery_level = Column(Integer, default=100)
    ping_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
