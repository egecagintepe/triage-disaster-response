"""Earthquake model."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Float, String, DateTime, JSON
from database import Base

class Earthquake(Base):
    __tablename__ = "earthquakes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    earthquake_id = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(200), nullable=False)
    magnitude = Column(Float, nullable=False)
    depth_km = Column(Float, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    date_time = Column(DateTime, nullable=False)
    provider = Column(String(50), nullable=True)
    geojson = Column(JSON, nullable=True)
    location_properties = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
