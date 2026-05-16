"""TRIAGE V2 – FastAPI entry point."""

import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from database import init_db, async_session
from routes.tasks import router as tasks_router
from routes.teams import router as teams_router
from routes.zones import router as zones_router
from routes.auth import router as auth_router
from managers.websocket import ConnectionManager
from services.sync_service import process_sync_changes, get_changes_since


# Global WebSocket manager instance
ws_manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Startup: create tables
    await init_db()
    print("[OK] Database initialised")
    yield
    # Shutdown
    print("[STOP] Shutting down")


app = FastAPI(
    title="TRIAGE V2 API",
    description="Offline-First Afet Yönetim Sistemi – Backend API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS – permissive for LAN usage
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(teams_router)
app.include_router(zones_router)


@app.get("/health", tags=["system"])
async def health_check():
    """Simple health check endpoint."""
    return {
        "status": "ok",
        "service": "triage-v2",
        "connected_devices": ws_manager.connection_count,
    }


@app.websocket("/ws/{device_id}")
async def websocket_endpoint(websocket: WebSocket, device_id: str):
    """WebSocket endpoint for real-time device communication.

    Protocol:
    - Client sends JSON messages with a "type" field.
    - Server broadcasts updates to all connected devices.
    - Supports: SYNC_REQUEST, LOCATION_UPDATE, TASK_STATUS_UPDATE
    """
    await ws_manager.connect(websocket, device_id)
    try:
        while True:
            data = await websocket.receive_json()
            await handle_device_message(device_id, data)
    except WebSocketDisconnect:
        ws_manager.disconnect(device_id)
    except Exception as e:
        print(f"[WS] Error for {device_id}: {e}")
        ws_manager.disconnect(device_id)


async def handle_device_message(device_id: str, data: dict):
    """Route incoming WebSocket messages by type."""
    msg_type = data.get("type", "")

    if msg_type == "SYNC_REQUEST":
        await handle_sync_request(device_id, data)

    elif msg_type == "LOCATION_UPDATE":
        # Client is reporting its GPS position
        # Broadcast to admin clients for map tracking
        await ws_manager.broadcast({
            "type": "DEVICE_LOCATION",
            "device_id": device_id,
            "lat": data.get("lat"),
            "lng": data.get("lng"),
            "timestamp": data.get("timestamp"),
        }, exclude=device_id)

    elif msg_type == "TASK_STATUS_UPDATE":
        # Client is updating a task status
        await handle_task_status_update(device_id, data)

    elif msg_type == "pong":
        # Heartbeat response — no action needed
        pass

    else:
        print(f"[WS] Unknown message type from {device_id}: {msg_type}")


async def handle_sync_request(device_id: str, data: dict):
    """Handle a SYNC_REQUEST from a client.

    1. Process any pending_changes from the client (conflict resolution)
    2. Fetch all changes since client's last_sync_timestamp
    3. Send SYNC_RESPONSE with changes + conflicts
    4. Broadcast accepted changes to all OTHER devices
    """
    pending_changes = data.get("pending_changes", [])
    last_sync_ts = data.get("last_sync_timestamp", 0)

    applied_changes = []
    conflicts = []

    # 1. Process client's offline changes (if any)
    if pending_changes:
        async with async_session() as session:
            applied_changes, conflicts = await process_sync_changes(
                session, pending_changes
            )

    # 2. Fetch server-side changes since client's last sync
    server_changes = []
    async with async_session() as session:
        server_changes = await get_changes_since(session, last_sync_ts)

    # 3. Send SYNC_RESPONSE to the requesting device
    await ws_manager.send_personal(device_id, {
        "type": "SYNC_RESPONSE",
        "timestamp": __import__("time").time() * 1000,
        "changes": server_changes,
        "conflicts": conflicts,
    })

    # 4. Broadcast accepted changes to all OTHER connected devices
    if applied_changes:
        for change in applied_changes:
            if change.get("entity") == "task":
                await ws_manager.broadcast_task_update(
                    change.get("data", {}),
                    source_device=device_id,
                )


async def handle_task_status_update(device_id: str, data: dict):
    """Handle a real-time task status update from a field device.

    1. Apply the change to the database (with conflict resolution)
    2. Broadcast the update to all other devices
    """
    task_data = data.get("data", {})
    if not task_data.get("id"):
        return

    async with async_session() as session:
        applied, conflicts = await process_sync_changes(
            session,
            [{
                "entity": "task",
                "id": task_data["id"],
                "operation": "update",
                "data": task_data,
            }],
        )

    # Broadcast accepted changes
    if applied:
        for change in applied:
            await ws_manager.broadcast_task_update(
                change.get("data", {}),
                source_device=device_id,
            )
    elif conflicts:
        # Send conflict info back to the originating device
        await ws_manager.send_personal(device_id, {
            "type": "SYNC_RESPONSE",
            "changes": [],
            "conflicts": conflicts,
        })
