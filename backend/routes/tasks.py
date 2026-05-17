"""Task CRUD endpoints – /api/v1/tasks.

Hooks into dispatcher for auto-reassignment on completion/cancellation
and backup workflow on needs_backup status.
"""

from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.task import Task
from schemas.task import TaskCreate, TaskUpdate, TaskResponse
from services.dispatcher import (
    assign_pending_tasks,
    handle_backup_request,
    release_team,
    broadcast_assignments,
    broadcast_backup,
    broadcast_team_release,
)

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    zone_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List tasks with optional filters."""
    stmt = select(Task)
    if status:
        stmt = stmt.where(Task.status == status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if zone_id:
        stmt = stmt.where(Task.zone_id == zone_id)
    stmt = stmt.order_by(Task.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single task by ID."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/approve-all", status_code=200)
async def approve_all_tasks(db: AsyncSession = Depends(get_db)):
    """Phase 3: Bulk Approval Endpoint"""
    from sqlalchemy import update
    stmt = update(Task).where(Task.status == 'pending_approval').values(
        status='pending',
        updated_at=datetime.now(timezone.utc)
    ).returning(Task)
    
    result = await db.execute(stmt)
    updated_tasks = result.scalars().all()
    await db.commit()
    
    # NOTE: Auto-dispatch removed. Admin must explicitly trigger OTO-ATA.
    # assignments = await assign_pending_tasks(db)
    # if assignments:
    #     await broadcast_assignments(assignments)
        
    try:
        from main import ws_manager
        # Tell frontend to reload tasks or broadcast each updated task
        for task in updated_tasks:
            # Resolve device_id for field app matching
            device_id = None
            if task.assigned_team_id:
                from models.team import Team
                team_r = await db.execute(select(Team).where(Team.id == task.assigned_team_id))
                team_obj = team_r.scalar_one_or_none()
                device_id = team_obj.device_id if team_obj else None

            await ws_manager.broadcast_task_update({
                "id": task.id,
                "status": task.status,
                "assigned_team_id": device_id or task.assigned_team_id,
                "priority": task.priority,
                "address": task.address,
                "lat": task.lat,
                "lng": task.lng,
            })
    except Exception as e:
        print(f"[WS] Error broadcasting bulk update: {e}")

    return {"status": "ok", "approved_count": len(updated_tasks)}


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(payload: TaskCreate, db: AsyncSession = Depends(get_db)):
    """Create a new task."""
    task = Task(**payload.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # NOTE: Auto-dispatch removed. Admin must explicitly trigger OTO-ATA.
    # assignments = await assign_pending_tasks(db)
    # if assignments:
    #     await broadcast_assignments(assignments)

    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: int, payload: TaskUpdate, db: AsyncSession = Depends(get_db)):
    """Update an existing task (partial update).

    Dispatcher hooks:
    - resolved / false_alarm → release team + reassign pending tasks
    - needs_backup → assign additional idle team
    """
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    old_status = task.status

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    task.updated_at = datetime.now(timezone.utc)

    # Set lifecycle timestamps
    new_status = update_data.get("status")
    if new_status == "assigned" and not task.assigned_at:
        task.assigned_at = datetime.now(timezone.utc)
    elif new_status == "in_progress" and not task.started_at:
        task.started_at = datetime.now(timezone.utc)
    elif new_status in ("resolved", "false_alarm") and not task.completed_at:
        task.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(task)

    # --- Dispatcher hooks ---

    if new_status in ("resolved", "false_alarm") and old_status != new_status:
        # Release the assigned team → set idle
        release_info = await release_team(db, task_id)
        if release_info:
            await broadcast_team_release(release_info)

        # Auto-assign any remaining pending tasks to newly idle team
        assignments = await assign_pending_tasks(db)
        if assignments:
            await broadcast_assignments(assignments)

    elif new_status == "needs_backup" and old_status != "needs_backup":
        # Backup workflow: find additional idle team
        backup_info = await handle_backup_request(db, task_id)
        if backup_info:
            await broadcast_backup(backup_info)

    # Broadcast task update to all devices
    try:
        from main import ws_manager
        # HOTFIX: Resolve integer team.id → string device_id for field app matching
        assigned_device_id = None
        if task.assigned_team_id:
            from models.team import Team
            team_result2 = await db.execute(select(Team).where(Team.id == task.assigned_team_id))
            assigned_team_obj = team_result2.scalar_one_or_none()
            assigned_device_id = assigned_team_obj.device_id if assigned_team_obj else None

        task_data_dict = {
            "id": task.id,
            "zone_id": task.zone_id,
            "status": task.status,
            "assigned_team_id": assigned_device_id or task.assigned_team_id,
            "priority": task.priority,
            "address": task.address,
            "lat": task.lat,
            "lng": task.lng,
            "building_type": task.building_type,
            "notes": task.notes,
        }
        await ws_manager.broadcast_task_update(task_data_dict)
        
        if new_status == "assigned" and task.assigned_team_id:
            from models.team import Team
            team_result = await db.execute(select(Team).where(Team.id == task.assigned_team_id))
            assigned_team = team_result.scalar_one_or_none()
            if assigned_team:
                await ws_manager.send_task_assignment(assigned_team.device_id, task_data_dict)
    except Exception:
        pass

    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Release team if assigned
    if task.assigned_team_id:
        release_info = await release_team(db, task_id)
        if release_info:
            await broadcast_team_release(release_info)

    await db.delete(task)
    await db.commit()
