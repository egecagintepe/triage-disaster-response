"""TRIAGE V2 – FastAPI entry point."""

import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from config import CORS_ORIGINS
from database import init_db, async_session
from routes.tasks import router as tasks_router
from routes.teams import router as teams_router
from routes.zones import router as zones_router
from routes.auth import router as auth_router
from routes.admin import router as admin_router
from managers.websocket import ConnectionManager
from services.sync_service import process_sync_changes, get_changes_since


# Global WebSocket manager instance
ws_manager = ConnectionManager()


# ---- Autonomous AI Triage Loop ----
_last_processed_eq_id: str | None = None
_ai_loop_task: asyncio.Task | None = None

async def _autonomous_triage_loop():
    """Background loop: poll Kandilli every 60s, auto-generate zones+tasks."""
    global _last_processed_eq_id
    from services.afad_client import fetch_latest_earthquake
    from services.ai_engine import analyze_with_gemini, generate_fallback_analysis
    from services.task_generator import generate_from_analysis
    from services.dispatcher import assign_pending_tasks, broadcast_assignments

    print("[AI-LOOP] Autonomous triage loop started")
    await asyncio.sleep(5)  # Initial delay for server boot

    while True:
        try:
            earthquake = await fetch_latest_earthquake()
            eq_id = earthquake.get("earthquake_id", "")

            if eq_id and eq_id != _last_processed_eq_id:
                _last_processed_eq_id = eq_id
                mag = earthquake.get("magnitude", 0)
                loc = earthquake.get("location", "Bilinmeyen")
                print(f"[AI-LOOP] New earthquake detected: M{mag} {loc} ({eq_id})")

                # Step 1: AI Analysis
                affected = earthquake.get("affected_regions", [])
                ai_result = await analyze_with_gemini(earthquake, affected)
                if ai_result and "zones" in ai_result:
                    analysis = ai_result
                    method = "gemini"
                else:
                    analysis = generate_fallback_analysis(earthquake)
                    method = "fallback"
                print(f"[AI-LOOP] Analysis complete ({method}): {len(analysis.get('zones', []))} zones")

                # Step 2: Create zones + tasks in DB
                async with async_session() as session:
                    result = await generate_from_analysis(session, analysis, earthquake)
                    print(f"[AI-LOOP] Created {result['zones_created']} zones, {result['tasks_created']} tasks")

                    # Step 3: Broadcast via WebSocket
                    try:
                        await ws_manager.broadcast({
                            "type": "BROADCAST",
                            "message": (
                                f"🤖 OTOMATİK AI TRİAJ: M{mag} {loc} — "
                                f"{result['zones_created']} bölge, {result['tasks_created']} görev oluşturuldu ({method})"
                            ),
                        })
                        for task_data in result.get("tasks", []):
                            await ws_manager.broadcast({"type": "NEW_TASK", "data": task_data})
                        for zone_data in result.get("zones", []):
                            await ws_manager.broadcast({"type": "ZONE_UPDATE", "data": zone_data})
                    except Exception as e:
                        print(f"[AI-LOOP] Broadcast error (non-fatal): {e}")

                    # Step 4: Auto-assign tasks
                    assignments = await assign_pending_tasks(session)
                    if assignments:
                        await broadcast_assignments(assignments)
                        print(f"[AI-LOOP] Auto-assigned {len(assignments)} tasks")
            else:
                pass  # Same earthquake, skip

        except Exception as e:
            print(f"[AI-LOOP] Error (non-fatal, retrying): {e}")

        await asyncio.sleep(60)  # Poll every 60 seconds


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    global _ai_loop_task
    # Startup: create tables
    await init_db()
    print("[OK] Database initialised")
    # Start autonomous AI loop
    _ai_loop_task = asyncio.create_task(_autonomous_triage_loop())
    print("[OK] Autonomous AI triage loop started")
    yield
    # Shutdown
    if _ai_loop_task:
        _ai_loop_task.cancel()
    print("[STOP] Shutting down")


app = FastAPI(
    title="TRIAGE V2 API",
    description="Offline-First Afet Yönetim Sistemi – Backend API",
    version="0.1.0",
    lifespan=lifespan,
)

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")

# CORS – permissive for LAN usage
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:3001", 
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:8000", 
        "http://localhost:8000",
        "http://localhost:8080",
        "http://localhost:8081",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip compression for large sync payloads
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Rate limiting for auth + admin endpoints
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["50/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Register routers
app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(teams_router)
app.include_router(zones_router)
app.include_router(admin_router)

from routes.emergency import router as emergency_router
app.include_router(emergency_router)


# ---- PHASE 2: God Mode Debug Injector ----
from fastapi import Body
from pydantic import BaseModel

class MockEarthquake(BaseModel):
    lat: float = 38.4
    lng: float = 27.1
    magnitude: float = 6.8
    depth: float = 10.0
    city: str = "İzmir (Demo)"

@app.post("/api/debug/inject-earthquake", tags=["debug"])
async def inject_earthquake(eq: MockEarthquake = Body(...)):
    """God Mode: Inject a mock earthquake for live demo."""
    from services.ai_engine import analyze_with_gemini, generate_fallback_analysis
    from services.task_generator import generate_from_analysis
    from services.dispatcher import assign_pending_tasks, broadcast_assignments
    from services.afad_client import _generate_affected_regions

    affected = _generate_affected_regions(eq.lat, eq.lng, eq.magnitude, eq.city, [])

    mock_data = {
        "earthquake_id": f"DEMO-{int(__import__('time').time())}",
        "magnitude": eq.magnitude,
        "depth_km": eq.depth,
        "location": eq.city,
        "lat": eq.lat,
        "lng": eq.lng,
        "epicenter": {"lat": eq.lat, "lng": eq.lng},
        "affected_regions": affected,
        "date": __import__('datetime').datetime.now().isoformat(),
    }

    # AI Analysis (Gemini or fallback)
    ai_result = await analyze_with_gemini(mock_data, affected)
    if ai_result and "zones" in ai_result:
        analysis = ai_result
        method = "gemini"
    else:
        analysis = generate_fallback_analysis(mock_data)
        method = "fallback"

    # Generate zones + tasks
    async with async_session() as session:
        result = await generate_from_analysis(session, analysis, mock_data)
        assignments = await assign_pending_tasks(session)

    # Broadcast everything
    await ws_manager.broadcast({
        "type": "BROADCAST",
        "message": f"🚨 SİMÜLASYON: M{eq.magnitude} {eq.city} — {result['zones_created']} bölge, {result['tasks_created']} görev ({method})",
    })
    for task_data in result.get("tasks", []):
        await ws_manager.broadcast({"type": "NEW_TASK", "data": task_data})
    for zone_data in result.get("zones", []):
        await ws_manager.broadcast({"type": "ZONE_UPDATE", "data": zone_data})
    if assignments:
        await broadcast_assignments(assignments)

    return {
        "status": "injected",
        "method": method,
        "zones_created": result["zones_created"],
        "tasks_created": result["tasks_created"],
        "auto_assigned": len(assignments) if assignments else 0,
    }

@app.get("/api/debug/ai-status", tags=["debug"])
async def ai_status():
    """Check if Gemini AI engine is reachable."""
    import os
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return {"status": "offline", "mode": "deterministic"}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}")
            if resp.status_code == 200:
                return {"status": "online", "mode": "ai"}
    except Exception:
        pass
    return {"status": "offline", "mode": "deterministic"}


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
    """WebSocket endpoint for real-time device communication."""
    
    # Auto-registration
    client_ip = websocket.client.host if websocket.client else "unknown"
    from sqlalchemy import select
    from models.team import Team
    async with async_session() as session:
        result = await session.execute(select(Team).where(Team.device_id == device_id))
        team = result.scalar_one_or_none()
        if not team:
            team = Team(device_id=device_id, name=device_id, device_ip=client_ip, status="idle")
            session.add(team)
        else:
            team.device_ip = client_ip
            team.status = "idle"
        await session.commit()

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

    elif msg_type == "TELEMETRY_UPDATE":
        # Full telemetry: battery + location
        await ws_manager.broadcast({
            "type": "DEVICE_TELEMETRY",
            "device_id": device_id,
            "lat": data.get("lat"),
            "lng": data.get("lng"),
            "battery": data.get("battery", 1.0),
            "timestamp": data.get("timestamp"),
        }, exclude=device_id)
        # Also update DB
        async with async_session() as session:
            from sqlalchemy import select
            from models.team import Team as TeamModel
            result = await session.execute(select(TeamModel).where(TeamModel.device_id == device_id))
            team = result.scalar_one_or_none()
            if team:
                team.current_lat = data.get("lat")
                team.current_lng = data.get("lng")
                await session.commit()

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
    3. Trigger dispatcher hooks (release/reassign/backup)
    """
    from services.dispatcher import (
        assign_pending_tasks,
        handle_backup_request,
        release_team,
        broadcast_assignments,
        broadcast_backup,
        broadcast_team_release,
    )

    task_data = data.get("data", {})
    if not task_data.get("id"):
        return

    new_status = task_data.get("status", "")

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

        # --- Dispatcher hooks ---
        if new_status in ("resolved", "false_alarm"):
            async with async_session() as session:
                release_info = await release_team(session, task_data["id"])
                if release_info:
                    await broadcast_team_release(release_info)

                assignments = await assign_pending_tasks(session)
                if assignments:
                    await broadcast_assignments(assignments)

        elif new_status == "needs_backup":
            async with async_session() as session:
                backup_info = await handle_backup_request(session, task_data["id"])
                if backup_info:
                    await broadcast_backup(backup_info)

    elif conflicts:
        # Send conflict info back to the originating device
        await ws_manager.send_personal(device_id, {
            "type": "SYNC_RESPONSE",
            "changes": [],
            "conflicts": conflicts,
        })

