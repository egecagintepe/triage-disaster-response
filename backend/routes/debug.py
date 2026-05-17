from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import delete
from database import async_session
from models.task import Task
from models.zone import Zone
from models.team import Team
from models.system_event import SystemEvent
from services.ai_engine import analyze_with_gemini, generate_fallback_analysis
from services.task_generator import generate_from_analysis
from datetime import datetime

router = APIRouter()

class InjectEarthquakeReq(BaseModel):
    lat: float
    lng: float
    magnitude: float
    depth: float
    city: str

@router.get("/ai-status")
async def get_ai_status():
    # Basic health check for the AI service
    return {
        "status": "online",
        "provider": "gemini",
        "message": "AI Engine is operational"
    }

@router.post("/clear-database")
async def clear_database():
    async with async_session() as session:
        await session.execute(delete(Task))
        await session.execute(delete(Zone))
        await session.execute(delete(Team))
        await session.execute(delete(SystemEvent))
        await session.commit()
    return {"status": "ok", "message": "Database cleared"}

# WARNING: Development only. Disable in production.
@router.post("/inject-earthquake")
async def inject_earthquake(req: InjectEarthquakeReq):
    earthquake = {
        "earthquake_id": f"demo-{int(datetime.now().timestamp())}",
        "lat": req.lat,
        "lng": req.lng,
        "magnitude": req.magnitude,
        "depth_km": req.depth,
        "location": req.city,
        "affected_regions": [{"name": req.city, "distance_km": 0}]
    }
    
    ai_result = await analyze_with_gemini(earthquake, earthquake["affected_regions"])
    if ai_result and "zones" in ai_result:
        analysis = ai_result
        method = "gemini"
    else:
        analysis = generate_fallback_analysis(earthquake)
        method = "fallback"

    async with async_session() as session:
        result = await generate_from_analysis(session, analysis, earthquake)
        
        try:
            import main
            await main.ws_manager.broadcast({
                "type": "BROADCAST",
                "message": (
                    f"🤖 SİMÜLASYON: M{req.magnitude} {req.city} — "
                    f"{result['zones_created']} bölge, {result['tasks_created']} görev oluşturuldu ({method})"
                ),
            })
            for task_data in result.get("tasks", []):
                await main.ws_manager.broadcast({"type": "NEW_TASK", "data": task_data})
            for zone_data in result.get("zones", []):
                await main.ws_manager.broadcast({"type": "ZONE_UPDATE", "data": zone_data})
        except Exception as e:
            print(f"[DEBUG] Broadcast error: {e}")

        from services.dispatcher import assign_pending_tasks, broadcast_assignments
        # NOTE: Auto-dispatch removed. Admin must explicitly trigger OTO-ATA.
        # assignments = await assign_pending_tasks(session)
        # if assignments:
        #     await broadcast_assignments(assignments)
            
    return {
        "status": "ok", 
        "zones_created": result["zones_created"], 
        "tasks_created": result["tasks_created"],
        "method": method
    }
