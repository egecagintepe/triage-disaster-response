"""TRIAGE V2 – FastAPI entry point."""

import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from database import init_db
from routes.tasks import router as tasks_router
from routes.teams import router as teams_router
from routes.zones import router as zones_router
from routes.auth import router as auth_router
from managers.websocket import ConnectionManager


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
        # Client is requesting a sync — send back current state
        # TODO: Implement delta sync logic
        await ws_manager.send_personal(device_id, {
            "type": "SYNC_RESPONSE",
            "changes": [],
            "conflicts": [],
        })

    elif msg_type == "LOCATION_UPDATE":
        # Client is reporting its GPS position
        # Broadcast to admin clients for map tracking
        await ws_manager.broadcast({
            "type": "DEVICE_LOCATION",
            "device_id": device_id,
            "lat": data.get("lat"),
            "lng": data.get("lng"),
        }, exclude=device_id)

    elif msg_type == "TASK_STATUS_UPDATE":
        # Client is updating a task status — broadcast to all
        await ws_manager.broadcast({
            "type": "TASK_UPDATE",
            "data": data.get("data", {}),
            "source_device": device_id,
        }, exclude=device_id)

    else:
        print(f"[WS] Unknown message type from {device_id}: {msg_type}")
