"""Dispatcher Service — autonomous task assignment engine.

Handles:
1. Auto-assignment of pending tasks to idle teams (priority-ordered, proximity-aware)
2. Backup request workflow (needs_backup → assign additional team)
3. Team release on task completion → immediate reassignment

All mutations broadcast via WebSocket for real-time dashboard/field updates.
"""

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, case
from sqlalchemy.ext.asyncio import AsyncSession

from models.task import Task
from models.team import Team


# Priority sort order: RED first, then YELLOW, then GREEN
PRIORITY_ORDER = {"RED": 1, "YELLOW": 2, "GREEN": 3}


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Simple haversine distance in km between two coordinates."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _find_nearest_team(
    task: Task, idle_teams: List[Team]
) -> Optional[Team]:
    """Find the idle team closest to a task's coordinates."""
    if not idle_teams:
        return None

    best_team = None
    best_dist = float("inf")

    for team in idle_teams:
        if team.current_lat is not None and team.current_lng is not None:
            dist = _haversine_km(task.lat, task.lng, team.current_lat, team.current_lng)
        else:
            # No GPS → treat as infinite distance but still eligible
            dist = 999999.0

        if dist < best_dist:
            best_dist = dist
            best_team = team

    return best_team


async def assign_pending_tasks(session: AsyncSession) -> List[Dict[str, Any]]:
    """Auto-assign all pending tasks to idle teams.

    Priority: RED > YELLOW > GREEN.
    Matching: nearest idle team by haversine distance.

    Returns:
        List of assignment dicts: {task_id, team_id, team_device_id, priority, address}
    """
    # Fetch pending tasks ordered by priority
    priority_case = case(
        (Task.priority == "RED", 1),
        (Task.priority == "YELLOW", 2),
        (Task.priority == "GREEN", 3),
        else_=4,
    )
    result = await session.execute(
        select(Task)
        .where(Task.status == "pending")
        .order_by(priority_case, Task.created_at.asc())
    )
    pending_tasks = list(result.scalars().all())

    if not pending_tasks:
        return []

    # Fetch idle teams
    result = await session.execute(
        select(Team).where(Team.status == "idle")
    )
    idle_teams = list(result.scalars().all())

    assignments = []

    for task in pending_tasks:
        if not idle_teams:
            break  # No more idle teams

        team = _find_nearest_team(task, idle_teams)
        if not team:
            break

        # Assign
        task.status = "assigned"
        task.assigned_team_id = team.id
        task.assigned_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)

        team.status = "busy"
        team.last_seen = datetime.now(timezone.utc)

        # NOTE: Do NOT remove team from idle_teams — teams can hold multiple tasks

        assignments.append({
            "task_id": task.id,
            "zone_id": task.zone_id,
            "team_id": team.id,
            "team_device_id": team.device_id,
            "team_name": team.name,
            "priority": task.priority,
            "address": task.address,
            "lat": task.lat,
            "lng": task.lng,
        })

    if assignments:
        await session.commit()
        print(f"[DISPATCH] Assigned {len(assignments)} tasks")

    return assignments


async def handle_backup_request(
    session: AsyncSession, task_id: int
) -> Optional[Dict[str, Any]]:
    """Handle a needs_backup task by assigning an additional idle team.

    Returns:
        Assignment dict if a backup team was found, None otherwise.
    """
    result = await session.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task or task.status != "needs_backup":
        return None

    # Find idle team nearest to this task
    result = await session.execute(
        select(Team).where(Team.status == "idle")
    )
    idle_teams = list(result.scalars().all())

    backup_team = _find_nearest_team(task, idle_teams)
    if not backup_team:
        print(f"[DISPATCH] No idle team for backup on task #{task_id}")
        return None

    # Don't reassign the task — keep original team. Mark backup team as busy.
    backup_team.status = "busy"
    backup_team.last_seen = datetime.now(timezone.utc)

    # Update task notes to record backup assignment
    backup_note = f"Destek ekip atandı: {backup_team.name} ({backup_team.device_id})"
    task.notes = f"{task.notes}\n{backup_note}" if task.notes else backup_note
    task.updated_at = datetime.now(timezone.utc)

    await session.commit()

    assignment = {
        "task_id": task.id,
        "backup_team_id": backup_team.id,
        "backup_team_device_id": backup_team.device_id,
        "backup_team_name": backup_team.name,
        "priority": task.priority,
        "address": task.address,
    }
    print(f"[DISPATCH] Backup team {backup_team.name} assigned to task #{task_id}")
    return assignment


async def release_team(
    session: AsyncSession, task_id: int
) -> Optional[Dict[str, Any]]:
    """Release a team after task completion (resolved/false_alarm).

    Sets team status back to idle.

    Returns:
        Dict with released team info, or None if no team was assigned.
    """
    result = await session.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task or not task.assigned_team_id:
        return None

    result = await session.execute(
        select(Team).where(Team.id == task.assigned_team_id)
    )
    team = result.scalar_one_or_none()

    if not team:
        return None

    team.status = "idle"
    team.last_seen = datetime.now(timezone.utc)
    await session.commit()

    released = {
        "team_id": team.id,
        "team_device_id": team.device_id,
        "team_name": team.name,
        "released_from_task": task_id,
    }
    print(f"[DISPATCH] Team {team.name} released from task #{task_id}")
    return released


async def broadcast_assignments(assignments: List[Dict[str, Any]]) -> None:
    """Broadcast task assignments via WebSocket.

    Sends:
    - NEW_TASK_ASSIGNMENT to assigned device
    - TASK_UPDATE broadcast to all devices
    """
    try:
        from main import ws_manager

        for a in assignments:
            task_data = {
                "id": a["task_id"],
                "zone_id": a.get("zone_id"),
                "assigned_team_id": a["team_device_id"],  # HOTFIX: Use string device_id, not integer PK
                "status": "assigned",
                "priority": a["priority"],
                "address": a.get("address"),
                "lat": a.get("lat"),
                "lng": a.get("lng"),
            }

            # Personal notification to assigned field device
            await ws_manager.send_task_assignment(
                a["team_device_id"], task_data
            )

            # Broadcast update to all (admin dashboard, other field devices)
            await ws_manager.broadcast_task_update(task_data)

        if assignments:
            await ws_manager.broadcast({
                "type": "BROADCAST",
                "message": f"📋 {len(assignments)} görev otomatik atandı",
            })

    except Exception as e:
        print(f"[DISPATCH] Broadcast error (non-fatal): {e}")


async def broadcast_backup(backup_info: Dict[str, Any]) -> None:
    """Broadcast backup assignment via WebSocket."""
    try:
        from main import ws_manager

        # Notify backup team
        await ws_manager.send_task_assignment(
            backup_info["backup_team_device_id"],
            {
                "id": backup_info["task_id"],
                "status": "needs_backup",
                "priority": backup_info["priority"],
                "address": backup_info.get("address"),
                "is_backup": True,
            },
        )

        await ws_manager.broadcast({
            "type": "BROADCAST",
            "message": f"🚨 Destek ekip ({backup_info['backup_team_name']}) görev #{backup_info['task_id']} için yola çıktı",
        })

    except Exception as e:
        print(f"[DISPATCH] Backup broadcast error (non-fatal): {e}")


async def broadcast_team_release(release_info: Dict[str, Any]) -> None:
    """Broadcast team release via WebSocket."""
    try:
        from main import ws_manager

        await ws_manager.broadcast({
            "type": "TASK_UPDATE",
            "data": {
                "team_id": release_info["team_id"],
                "team_status": "idle",
                "released_from_task": release_info["released_from_task"],
            },
        })

    except Exception as e:
        print(f"[DISPATCH] Release broadcast error (non-fatal): {e}")
