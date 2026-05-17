"""Emergency broadcast + QR code onboarding endpoints."""

import base64
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

router = APIRouter(prefix="/api/v1/emergency", tags=["emergency"])


# --- Schemas ---

class EmergencyAlertRequest(BaseModel):
    message: str = Field(default="KIRMIZI ALARM — TÜM EKİPLER DİKKAT!", max_length=500)
    severity: str = Field(default="critical", pattern=r"^(critical|warning|info)$")


class EmergencyAlertResponse(BaseModel):
    status: str
    devices_notified: int
    timestamp: str


# --- Endpoints ---

@router.post("/alert", response_model=EmergencyAlertResponse)
async def broadcast_emergency_alert(payload: EmergencyAlertRequest):
    """Broadcast KIRMIZI ALARM to all connected field devices."""
    from main import ws_manager

    ts = datetime.now(timezone.utc).isoformat()

    count = await ws_manager.broadcast({
        "type": "EMERGENCY_ALERT",
        "message": payload.message,
        "severity": payload.severity,
        "timestamp": ts,
    })

    return EmergencyAlertResponse(
        status="broadcast_sent",
        devices_notified=count,
        timestamp=ts,
    )


@router.post("/clear")
async def clear_emergency():
    """Clear emergency alert on all devices."""
    from main import ws_manager

    await ws_manager.broadcast({
        "type": "EMERGENCY_CLEAR",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "cleared"}


@router.get("/qr")
async def generate_qr_code(host: str = None, port: int = 5174):
    """Generate QR code containing Field App LAN URL as base64 PNG."""
    try:
        import qrcode
        from qrcode.image.pure import PyPNGImage

        # Detect server IP from env or fallback
        if host:
            field_url = f"http://{host}:{port}"
        else:
            import socket
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            field_url = f"http://{local_ip}:5174"

        qr = qrcode.QRCode(version=1, box_size=10, border=2)
        qr.add_data(field_url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="white", back_color="black")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        b64 = base64.b64encode(buffer.read()).decode("utf-8")

        return {
            "qr_base64": f"data:image/png;base64,{b64}",
            "url": field_url,
            "ip": local_ip,
        }
    except ImportError:
        # qrcode lib not installed — return URL only
        import socket
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        field_url = f"http://{local_ip}:5174"
        return {
            "qr_base64": None,
            "url": field_url,
            "ip": local_ip,
            "error": "qrcode library not installed. Run: pip install qrcode[pil]",
        }


@router.get("/server-info")
async def server_info():
    """Return server uptime and connection stats."""
    from main import ws_manager
    import time

    return {
        "connected_devices": ws_manager.connection_count,
        "device_ids": ws_manager.get_connected_devices(),
        "server_time": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": time.monotonic(),
    }
