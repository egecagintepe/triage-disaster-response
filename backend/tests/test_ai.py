"""AI flow tests — POST /api/v1/admin/run-ai-analysis with mocked Gemini."""

import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient
from sqlalchemy import select

from models.zone import Zone
from models.task import Task
from tests.conftest import TestSessionLocal


pytestmark = pytest.mark.asyncio


# Static mock response matching Gemini structured output schema
MOCK_AI_ANALYSIS = {
    "analysis_timestamp": "2024-01-15T04:30:00Z",
    "zones": [
        {
            "name": "Bayraklı",
            "priority_score": 4.8,
            "estimated_casualties": 230,
            "recommended_team_count": 5,
            "risk_factors": "Episantra 3.1km, eski bina oranı %62, yumuşak zemin",
        },
        {
            "name": "Konak",
            "priority_score": 4.5,
            "estimated_casualties": 180,
            "recommended_team_count": 4,
            "risk_factors": "Episantra 1.5km, eski bina oranı %55",
        },
        {
            "name": "Bornova Merkez",
            "priority_score": 3.8,
            "estimated_casualties": 90,
            "recommended_team_count": 3,
            "risk_factors": "Episantra 5.2km, eski bina oranı %45",
        },
    ],
}


# Patch at the import site in routes.admin, not in services.ai_engine
@patch("routes.admin.analyze_with_gemini", new_callable=AsyncMock)
async def test_ai_analysis_creates_zones_and_tasks(mock_gemini, client: AsyncClient):
    """POST /run-ai-analysis with mocked Gemini creates Zone + Task records."""
    mock_gemini.return_value = MOCK_AI_ANALYSIS

    response = await client.post("/api/v1/admin/run-ai-analysis", json={})

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["analysis_method"] == "gemini"
    assert data["zones_created"] == 3
    assert data["tasks_created"] > 0  # 5 + 4 + 3 = 12

    # Verify zones in DB
    async with TestSessionLocal() as session:
        result = await session.execute(select(Zone))
        zones = result.scalars().all()
        assert len(zones) == 3

        zone_names = {z.name for z in zones}
        assert "Bayraklı" in zone_names
        assert "Konak" in zone_names

        # Verify tasks in DB
        result = await session.execute(select(Task))
        tasks = result.scalars().all()
        assert len(tasks) == 12  # 5 + 4 + 3

        # All tasks should be pending initially
        for t in tasks:
            assert t.status == "pending"
            assert t.priority in ("RED", "YELLOW", "GREEN")


@patch("routes.admin.analyze_with_gemini", new_callable=AsyncMock)
async def test_ai_analysis_fallback(mock_gemini, client: AsyncClient):
    """When Gemini returns None, falls back to rule-based scoring."""
    mock_gemini.return_value = None

    response = await client.post("/api/v1/admin/run-ai-analysis", json={})

    assert response.status_code == 200
    data = response.json()
    assert data["analysis_method"] == "fallback_rules"
    assert data["zones_created"] > 0
    assert data["tasks_created"] > 0


@patch("routes.admin.analyze_with_gemini", new_callable=AsyncMock)
async def test_ai_analysis_zone_priority_scores(mock_gemini, client: AsyncClient):
    """Verify zone priority scores from mocked Gemini propagate correctly."""
    mock_gemini.return_value = MOCK_AI_ANALYSIS

    await client.post("/api/v1/admin/run-ai-analysis", json={})

    async with TestSessionLocal() as session:
        # Bayraklı zone (score 4.8 from mock)
        result = await session.execute(
            select(Zone).where(Zone.name == "Bayraklı")
        )
        bayr = result.scalar_one()
        assert bayr.priority_score == 4.8

        result = await session.execute(
            select(Task).where(Task.zone_id == bayr.id)
        )
        tasks = result.scalars().all()
        assert len(tasks) == 5
        for t in tasks:
            assert t.priority == "RED"  # score 4.8 >= 3.5 → RED


@patch("routes.admin.analyze_with_gemini", new_callable=AsyncMock)
async def test_ai_tasks_have_offset_coordinates(mock_gemini, client: AsyncClient):
    """Tasks for same zone should have slightly different coordinates (no overlap)."""
    mock_gemini.return_value = MOCK_AI_ANALYSIS

    await client.post("/api/v1/admin/run-ai-analysis", json={})

    async with TestSessionLocal() as session:
        result = await session.execute(
            select(Zone).where(Zone.name == "Konak")
        )
        konak = result.scalar_one()

        result = await session.execute(
            select(Task).where(Task.zone_id == konak.id)
        )
        tasks = result.scalars().all()

        # All tasks should have unique coordinate pairs
        coords = [(t.lat, t.lng) for t in tasks]
        assert len(coords) == len(set(coords)), "Tasks should have unique coordinates"
