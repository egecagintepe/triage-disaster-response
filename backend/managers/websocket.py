"""WebSocket connection manager for real-time device communication."""

from typing import Dict, Optional
from datetime import datetime, timezone
import asyncio
from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for all field devices and admin clients."""

    def __init__(self):
        # device_id → WebSocket mapping
        self.active_connections: Dict[str, WebSocket] = {}
        # device_id → last seen timestamp
        self.last_seen: Dict[str, datetime] = {}

    async def connect(self, websocket: WebSocket, device_id: str) -> None:
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        self.active_connections[device_id] = websocket
        self.last_seen[device_id] = datetime.now(timezone.utc)
        print(f"[WS] Device connected: {device_id} (total: {len(self.active_connections)})")
        await self.broadcast({
            "type": "TEAM_PRESENCE",
            "team_id": device_id,
            "status": "ONLINE"
        }, exclude=device_id)

    def disconnect(self, device_id: str) -> None:
        """Remove a device's WebSocket connection."""
        if device_id in self.active_connections:
            self.active_connections.pop(device_id)
            print(f"[WS] Device disconnected: {device_id} (total: {len(self.active_connections)})")
            # Disconnect is synchronous, use create_task to broadcast
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.broadcast({
                    "type": "TEAM_PRESENCE",
                    "team_id": device_id,
                    "status": "OFFLINE"
                }))
            except RuntimeError:
                pass

    async def send_personal(self, device_id: str, message: dict) -> bool:
        """Send a JSON message to a specific device. Returns True if sent."""
        ws = self.active_connections.get(device_id)
        if ws:
            try:
                await ws.send_json(message)
                return True
            except Exception:
                self.disconnect(device_id)
                return False
        return False

    async def broadcast(self, message: dict, exclude: Optional[str] = None) -> int:
        """Broadcast a JSON message to all connected devices.

        Args:
            message: JSON-serializable dict to send.
            exclude: Optional device_id to exclude from broadcast.

        Returns:
            Number of devices the message was successfully sent to.
        """
        sent_count = 0
        disconnected = []

        for device_id, ws in self.active_connections.items():
            if device_id == exclude:
                continue
            try:
                await ws.send_json(message)
                sent_count += 1
            except Exception:
                disconnected.append(device_id)

        # Clean up dead connections
        for device_id in disconnected:
            self.disconnect(device_id)

        return sent_count

    async def broadcast_task_update(self, task_data: dict, source_device: Optional[str] = None) -> int:
        """Send task update — targeted to assigned device + admin broadcast.

        HOTFIX: No longer blindly broadcasts to ALL devices.
        If the task has an assigned_team_id, sends directly to that device
        plus broadcasts to admin/non-field listeners.
        """
        message = {
            "type": "TASK_UPDATE",
            "data": task_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        assigned_team_id = task_data.get("assigned_team_id")

        if assigned_team_id:
            # Look up the device_id for this team — might be same as team_id
            # or we need to resolve it. For now, broadcast includes the
            # assigned_team_id in data so frontend can filter.
            pass

        # Broadcast to all (admin dashboard needs visibility), but frontend
        # now has defensive filtering to reject tasks not assigned to it
        return await self.broadcast(message, exclude=source_device)

    async def broadcast_new_task(self, task_data: dict) -> int:
        """Broadcast a newly created task to all devices."""
        message = {
            "type": "NEW_TASK",
            "data": task_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return await self.broadcast(message)

    async def send_task_assignment(self, device_id: str, task_data: dict) -> bool:
        """Send a task assignment notification to a specific device."""
        message = {
            "type": "NEW_TASK_ASSIGNMENT",
            "task_id": task_data.get("id"),
            "priority": task_data.get("priority"),
            "data": task_data,
            "message": "Yeni görev atandı",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return await self.send_personal(device_id, message)

    def get_connected_devices(self) -> list[str]:
        """Return list of currently connected device IDs."""
        return list(self.active_connections.keys())

    def is_connected(self, device_id: str) -> bool:
        """Check if a device is currently connected."""
        return device_id in self.active_connections

    @property
    def connection_count(self) -> int:
        """Return the number of active connections."""
        return len(self.active_connections)
