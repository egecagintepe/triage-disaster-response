"""API & CRUD tests — device registration, task CRUD."""

import pytest
import pytest_asyncio
from httpx import AsyncClient

from models.zone import Zone


pytestmark = pytest.mark.asyncio


async def test_device_registration(client: AsyncClient):
    """POST /api/v1/auth/register-device returns JWT token."""
    response = await client.post("/api/v1/auth/register-device", json={
        "device_id": "TEST-DEVICE-001",
        "device_name": "Test Field Unit",
        "device_type": "field_mobile",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["device_id"] == "TEST-DEVICE-001"
    assert data["role"] == "field_worker"
    assert data["token_type"] == "bearer"


async def test_device_registration_admin(client: AsyncClient):
    """Admin device gets admin role."""
    response = await client.post("/api/v1/auth/register-device", json={
        "device_id": "ADMIN-001",
        "device_name": "Komuta Merkezi",
        "device_type": "admin_desktop",
    })
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


async def test_device_re_registration(client: AsyncClient):
    """Re-registering same device_id issues new token (no error)."""
    payload = {
        "device_id": "RETEST-001",
        "device_name": "Retest Device",
        "device_type": "field_mobile",
    }
    r1 = await client.post("/api/v1/auth/register-device", json=payload)
    r2 = await client.post("/api/v1/auth/register-device", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
    # Both should return valid tokens
    assert len(r1.json()["access_token"]) > 20
    assert len(r2.json()["access_token"]) > 20
    # Same device_id returned
    assert r1.json()["device_id"] == r2.json()["device_id"]


async def test_task_list_empty(client: AsyncClient):
    """GET /api/v1/tasks returns empty list when DB is clean."""
    response = await client.get("/api/v1/tasks")
    assert response.status_code == 200
    assert response.json() == []


async def test_task_create_and_get(client: AsyncClient, db_session):
    """POST /api/v1/tasks creates a task, GET retrieves it."""
    # Need a zone first (FK constraint)
    zone = Zone(name="Test Zone", priority_score=3.5, population_density=5000)
    db_session.add(zone)
    await db_session.commit()
    await db_session.refresh(zone)

    # Create task
    response = await client.post("/api/v1/tasks", json={
        "zone_id": zone.id,
        "priority": "RED",
        "lat": 38.42,
        "lng": 27.13,
        "address": "Test Sokak No:1",
        "building_type": "residential",
    })
    assert response.status_code == 201
    task = response.json()
    assert task["priority"] == "RED"
    assert task["status"] == "pending"
    assert task["zone_id"] == zone.id

    # Get by ID
    response = await client.get(f"/api/v1/tasks/{task['id']}")
    assert response.status_code == 200
    assert response.json()["address"] == "Test Sokak No:1"


async def test_task_update_status(client: AsyncClient, db_session):
    """PATCH /api/v1/tasks/{id} updates task status."""
    zone = Zone(name="Patch Zone", priority_score=2.0, population_density=3000)
    db_session.add(zone)
    await db_session.commit()
    await db_session.refresh(zone)

    r = await client.post("/api/v1/tasks", json={
        "zone_id": zone.id, "priority": "YELLOW", "lat": 38.0, "lng": 27.0,
    })
    task_id = r.json()["id"]

    # Update to in_progress
    r2 = await client.patch(f"/api/v1/tasks/{task_id}", json={"status": "in_progress"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "in_progress"


async def test_task_not_found(client: AsyncClient):
    """GET /api/v1/tasks/99999 returns 404."""
    response = await client.get("/api/v1/tasks/99999")
    assert response.status_code == 404


async def test_team_list(client: AsyncClient):
    """GET /api/v1/teams returns list."""
    response = await client.get("/api/v1/teams")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
