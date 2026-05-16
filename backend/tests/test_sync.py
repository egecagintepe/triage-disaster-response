"""Sync & conflict resolution tests."""

import pytest
import pytest_asyncio
import time
from datetime import datetime, timezone, timedelta

from models.zone import Zone
from models.task import Task
from services.sync_service import process_sync_changes


pytestmark = pytest.mark.asyncio


async def _create_zone_and_task(db_session, *, status="pending", minutes_ago=5):
    """Helper: create a zone + task with a known server timestamp."""
    zone = Zone(name="Sync Zone", priority_score=3.0, population_density=5000)
    db_session.add(zone)
    await db_session.flush()

    ts = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    task = Task(
        zone_id=zone.id,
        priority="RED",
        status=status,
        lat=38.42,
        lng=27.13,
        address="Sync Test Sokak",
        updated_at=ts,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


async def test_client_newer_wins(db_session):
    """When client's local_updated_at > server's updated_at, client wins."""
    task = await _create_zone_and_task(db_session, status="pending", minutes_ago=10)

    # Client sends a newer timestamp (now)
    client_ts = int(time.time() * 1000)

    applied, conflicts = await process_sync_changes(db_session, [{
        "entity": "task",
        "id": task.id,
        "operation": "update",
        "data": {
            "id": task.id,
            "status": "in_progress",
            "local_updated_at": client_ts,
        },
    }])

    assert len(applied) == 1
    assert len(conflicts) == 0
    assert applied[0]["data"]["status"] == "in_progress"


async def test_server_newer_rejects(db_session):
    """When server's updated_at > client's local_updated_at, reject with conflict."""
    task = await _create_zone_and_task(db_session, status="in_progress", minutes_ago=0)

    # Client sends old timestamp (1 hour ago)
    old_ts = int((time.time() - 3600) * 1000)

    applied, conflicts = await process_sync_changes(db_session, [{
        "entity": "task",
        "id": task.id,
        "operation": "update",
        "data": {
            "id": task.id,
            "status": "resolved",
            "local_updated_at": old_ts,
        },
    }])

    assert len(applied) == 0
    assert len(conflicts) == 1
    assert conflicts[0]["reason"] == "server_newer"
    assert "server_data" in conflicts[0]


async def test_equal_timestamp_status_priority(db_session):
    """When timestamps equal, higher status priority wins."""
    task = await _create_zone_and_task(db_session, status="pending", minutes_ago=0)

    # Send exact server timestamp but with higher-priority status
    server_ts = int(task.updated_at.replace(tzinfo=timezone.utc).timestamp() * 1000)

    applied, conflicts = await process_sync_changes(db_session, [{
        "entity": "task",
        "id": task.id,
        "operation": "update",
        "data": {
            "id": task.id,
            "status": "needs_backup",  # priority 4 > pending's 1
            "local_updated_at": server_ts,
        },
    }])

    assert len(applied) == 1
    assert applied[0]["data"]["status"] == "needs_backup"


async def test_nonexistent_task_conflict(db_session):
    """Syncing a task that doesn't exist returns not_found conflict."""
    applied, conflicts = await process_sync_changes(db_session, [{
        "entity": "task",
        "id": 99999,
        "operation": "update",
        "data": {
            "id": 99999,
            "status": "resolved",
            "local_updated_at": int(time.time() * 1000),
        },
    }])

    assert len(applied) == 0
    assert len(conflicts) == 1
    assert conflicts[0]["reason"] == "not_found"


async def test_batch_sync_mixed_results(db_session):
    """Batch sync with multiple changes: some accepted, some conflicted."""
    task1 = await _create_zone_and_task(db_session, status="pending", minutes_ago=10)
    task2 = await _create_zone_and_task(db_session, status="in_progress", minutes_ago=0)

    now_ts = int(time.time() * 1000)
    old_ts = int((time.time() - 3600) * 1000)

    applied, conflicts = await process_sync_changes(db_session, [
        {
            "entity": "task", "id": task1.id, "operation": "update",
            "data": {"id": task1.id, "status": "resolved", "local_updated_at": now_ts},
        },
        {
            "entity": "task", "id": task2.id, "operation": "update",
            "data": {"id": task2.id, "status": "resolved", "local_updated_at": old_ts},
        },
    ])

    assert len(applied) == 1  # task1 accepted
    assert len(conflicts) == 1  # task2 rejected
