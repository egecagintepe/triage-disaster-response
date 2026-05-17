"""Sync service — conflict resolution and delta sync logic.

Implements Strategy 1 (timestamp comparison) from architecture.md Section 8.3.
When a client pushes offline changes, this service:
  1. Compares local_updated_at (client) vs updated_at (server)
  2. Applies the change if the client is newer
  3. Returns conflicts if the server is newer
  4. Broadcasts accepted changes to all other devices
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.task import Task
from models.team import Team


# Status priority for tie-breaking (architecture.md Section 8.3, Strategy 2)
STATUS_PRIORITY = {
    "resolved": 5,
    "needs_backup": 4,
    "false_alarm": 4,
    "in_progress": 3,
    "assigned": 2,
    "pending": 1,
}


async def process_sync_changes(
    session: AsyncSession,
    pending_changes: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Process a batch of offline changes from a client.

    Args:
        session: Async SQLAlchemy session.
        pending_changes: List of change dicts, each with:
            - entity: 'task' | 'team'
            - id: int
            - operation: 'create' | 'update' | 'delete'
            - data: dict of field values (must include local_updated_at)

    Returns:
        (applied_changes, conflicts):
            - applied_changes: changes that were accepted and written to DB
            - conflicts: changes rejected because server data is newer
    """
    applied: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []

    for change in pending_changes:
        entity = change.get("entity", "")
        operation = change.get("operation", "")
        data = change.get("data", {})
        entity_id = change.get("id") or data.get("id")

        if entity == "task" and entity_id:
            result = await _resolve_task_change(
                session, int(entity_id), operation, data
            )
            if result["accepted"]:
                applied.append(result["change"])
            else:
                conflicts.append(result["conflict"])

        elif entity == "team" and entity_id:
            result = await _resolve_team_change(
                session, int(entity_id), operation, data
            )
            if result["accepted"]:
                applied.append(result["change"])

    await session.commit()
    return applied, conflicts


async def get_changes_since(
    session: AsyncSession,
    since_timestamp: int,
) -> List[Dict[str, Any]]:
    """Return all task/team changes since a given unix timestamp.

    Used when a device reconnects and needs to pull updates.
    """
    changes: List[Dict[str, Any]] = []

    if since_timestamp > 0:
        since_dt = datetime.fromtimestamp(since_timestamp / 1000, tz=timezone.utc)
    else:
        since_dt = datetime.min.replace(tzinfo=timezone.utc)

    # Tasks updated since timestamp
    result = await session.execute(
        select(Task).where(Task.updated_at > since_dt)
    )
    for task in result.scalars().all():
        changes.append({
            "entity": "task",
            "operation": "update",
            "data": _task_to_dict(task),
        })

    return changes


# ---------------------------------------------------------------------------
#  Internal helpers
# ---------------------------------------------------------------------------


async def _resolve_task_change(
    session: AsyncSession,
    task_id: int,
    operation: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Resolve a single task change using timestamp comparison."""

    result = await session.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if task is None:
        # Task doesn't exist — nothing to update
        return {"accepted": False, "conflict": {
            "entity": "task", "id": task_id, "reason": "not_found",
        }}

    # --- Conflict Resolution: Strategy 1 (Timestamp comparison) ---
    client_ts = data.get("local_updated_at", 0)
    server_ts = int(task.updated_at.replace(tzinfo=timezone.utc).timestamp() * 1000) if task.updated_at else 0

    if client_ts > server_ts:
        # Client is newer → accept the change
        _apply_task_update(task, data)
        return {
            "accepted": True,
            "change": {
                "entity": "task",
                "operation": "update",
                "data": _task_to_dict(task),
            },
        }
    elif server_ts > client_ts:
        # Server is newer → reject, return server data as conflict
        return {
            "accepted": False,
            "conflict": {
                "entity": "task",
                "id": task_id,
                "reason": "server_newer",
                "server_data": _task_to_dict(task),
                "client_timestamp": client_ts,
                "server_timestamp": server_ts,
            },
        }
    else:
        # Equal timestamps → use status priority (Strategy 2)
        client_priority = STATUS_PRIORITY.get(data.get("status", ""), 0)
        server_priority = STATUS_PRIORITY.get(task.status or "", 0)

        if client_priority >= server_priority:
            _apply_task_update(task, data)
            return {
                "accepted": True,
                "change": {
                    "entity": "task",
                    "operation": "update",
                    "data": _task_to_dict(task),
                },
            }
        else:
            return {
                "accepted": False,
                "conflict": {
                    "entity": "task",
                    "id": task_id,
                    "reason": "status_priority",
                    "server_data": _task_to_dict(task),
                },
            }


async def _resolve_team_change(
    session: AsyncSession,
    team_id: int,
    operation: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Resolve a team change (no conflict logic — always accept)."""

    result = await session.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()

    if team is None:
        return {"accepted": False, "conflict": {
            "entity": "team", "id": team_id, "reason": "not_found",
        }}

    # Apply changes
    for field in ("status", "current_lat", "current_lng", "last_seen", "name"):
        if field in data:
            setattr(team, field, data[field])

    return {
        "accepted": True,
        "change": {
            "entity": "team",
            "operation": "update",
            "data": {
                "id": team.id,
                "device_id": team.device_id,
                "name": team.name,
                "status": team.status,
                "current_lat": team.current_lat,
                "current_lng": team.current_lng,
            },
        },
    }


def _apply_task_update(task: Task, data: Dict[str, Any]) -> None:
    """Apply a dict of updates to a Task ORM object."""
    updatable_fields = (
        "status", "assigned_team_id", "priority", "notes",
        "building_type", "reported_damage_level",
    )
    for field in updatable_fields:
        if field in data:
            setattr(task, field, data[field])

    # Set timestamps
    task.updated_at = datetime.now(timezone.utc)

    if data.get("local_updated_at"):
        task.local_updated_at = datetime.fromtimestamp(
            data["local_updated_at"] / 1000, tz=timezone.utc
        )

    # Auto-set lifecycle timestamps
    if data.get("status") == "assigned" and not task.assigned_at:
        task.assigned_at = datetime.now(timezone.utc)
    elif data.get("status") == "in_progress" and not task.started_at:
        task.started_at = datetime.now(timezone.utc)
    elif data.get("status") in ("resolved", "false_alarm") and not task.completed_at:
        task.completed_at = datetime.now(timezone.utc)


def _task_to_dict(task: Task) -> Dict[str, Any]:
    """Convert a Task ORM object to a JSON-safe dict."""
    return {
        "id": task.id,
        "zone_id": task.zone_id,
        "assigned_team_id": task.assigned_team_id,
        "status": task.status,
        "priority": task.priority,
        "lat": task.lat,
        "lng": task.lng,
        "address": task.address,
        "building_type": task.building_type,
        "reported_damage_level": task.reported_damage_level,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "local_updated_at": task.local_updated_at.isoformat() if task.local_updated_at else None,
        "assigned_at": task.assigned_at.isoformat() if task.assigned_at else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "notes": task.notes,
    }
