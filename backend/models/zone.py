"""Zone (AI-prioritised geographic region) model."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from database import Base


class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    priority_score = Column(Float, nullable=False)  # 1.0 (low) – 5.0 (critical)
    geometry = Column(JSON, nullable=True)  # GeoJSON polygon
    estimated_casualties = Column(Integer, nullable=True)
    building_density = Column(Integer, nullable=True)
    population_density = Column(Integer, nullable=True)
    infrastructure_risk = Column(Float, nullable=True)  # AI calculated
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
