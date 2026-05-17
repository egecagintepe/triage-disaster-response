"""Demo Scenario Generator — populates DB with realistic İzmir earthquake response data.

Usage:
    cd backend
    python ../scripts/generate_demo_scenario.py

Creates:
  - 8 realistic rescue teams (AFAD, İtfaiye, Kızılay, etc.)
  - AI-generated zones + tasks from live Kandilli API
  - Assigns 3 tasks to teams (active operations on map)
"""

import asyncio
import sys
import os
from datetime import datetime, timezone

# Fix Windows console encoding for Turkish chars + emoji
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import delete, select
from database import engine, async_session, Base
from models.team import Team
from models.task import Task
from models.zone import Zone
from models.system_event import SystemEvent
from services.afad_client import fetch_latest_earthquake
from services.ai_engine import analyze_with_gemini, generate_fallback_analysis
from services.task_generator import generate_from_analysis


# --- Realistic İzmir Rescue Teams ---

DEMO_TEAMS = [
    {
        "device_id": "AFAD-AK-001",
        "device_ip": "192.168.1.101",
        "name": "AFAD Arama Kurtarma 1",
        "status": "idle",
        "current_lat": 38.4535,
        "current_lng": 27.1597,
    },
    {
        "device_id": "AFAD-AK-002",
        "device_ip": "192.168.1.102",
        "name": "AFAD Arama Kurtarma 2",
        "status": "idle",
        "current_lat": 38.4189,
        "current_lng": 27.1287,
    },
    {
        "device_id": "ITF-IZM-001",
        "device_ip": "192.168.1.103",
        "name": "İzmir İtfaiyesi Ekip 1",
        "status": "idle",
        "current_lat": 38.4622,
        "current_lng": 27.2176,
    },
    {
        "device_id": "KZL-MED-001",
        "device_ip": "192.168.1.104",
        "name": "Kızılay Medikal Ekip",
        "status": "idle",
        "current_lat": 38.4400,
        "current_lng": 27.1450,
    },
    {
        "device_id": "UMKE-001",
        "device_ip": "192.168.1.105",
        "name": "UMKE Saha Ekibi",
        "status": "idle",
        "current_lat": 38.4310,
        "current_lng": 27.1380,
    },
    {
        "device_id": "JAK-001",
        "device_ip": "192.168.1.106",
        "name": "Jandarma JAK Tim",
        "status": "offline",
        "current_lat": 38.4700,
        "current_lng": 27.0900,
    },
    {
        "device_id": "AKT-001",
        "device_ip": "192.168.1.107",
        "name": "AKUT Gönüllü Ekibi",
        "status": "idle",
        "current_lat": 38.4450,
        "current_lng": 27.1700,
    },
    {
        "device_id": "BEL-001",
        "device_ip": "192.168.1.108",
        "name": "Büyükşehir Belediyesi Ekibi",
        "status": "offline",
        "current_lat": 38.4100,
        "current_lng": 27.1500,
    },
]


async def run():
    print("=" * 60)
    print("  TRIAGE — Demo Scenario Generator")
    print("=" * 60)

    # Create tables if needed
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # --- Step 1: Clear existing data ---
        print("\n[1/5] Clearing existing data...")
        await session.execute(delete(Task))
        await session.execute(delete(Zone))
        await session.execute(delete(Team))
        await session.execute(delete(SystemEvent))
        await session.commit()
        print("  ✓ All tables cleared")

        # --- Step 2: Insert demo teams ---
        print("\n[2/5] Creating rescue teams...")
        teams = []
        for t in DEMO_TEAMS:
            team = Team(**t)
            session.add(team)
            teams.append(team)
        await session.flush()

        for t in teams:
            status_icon = "🟢" if t.status == "idle" else "⚫"
            print(f"  {status_icon} {t.name} [{t.device_id}] — {t.status}")

        # --- Step 3: Fetch live earthquake data ---
        print("\n[3/5] Fetching live earthquake data from Kandilli...")
        earthquake = await fetch_latest_earthquake()
        print(f"  📡 M{earthquake['magnitude']} — {earthquake['location']}")
        print(f"  📍 ({earthquake['lat']:.4f}, {earthquake['lng']:.4f}) depth={earthquake['depth_km']}km")
        print(f"  🔗 Source: {earthquake.get('source', 'unknown')}")
        print(f"  🏘️ {len(earthquake.get('affected_regions', []))} affected regions")

        # --- Step 4: Run AI analysis + generate tasks ---
        print("\n[4/5] Running AI analysis...")
        affected_regions = earthquake.get("affected_regions", [])
        ai_result = await analyze_with_gemini(earthquake, affected_regions)

        if ai_result and "zones" in ai_result:
            analysis_method = "gemini"
            analysis = ai_result
        else:
            analysis_method = "fallback_rules"
            analysis = generate_fallback_analysis(earthquake)

        print(f"  🤖 Method: {analysis_method}")
        print(f"  📊 Zones analyzed: {len(analysis.get('zones', []))}")

        result = await generate_from_analysis(session, analysis, earthquake)
        print(f"  ✓ Created {result['zones_created']} zones, {result['tasks_created']} tasks")

        # Print zone details
        for z in result.get("zones", []):
            print(f"    🟡 {z['name']} — score: {z['priority_score']}, teams: {z['recommended_teams']}")

        # --- Step 5: Assign tasks to teams ---
        print("\n[5/5] Assigning tasks to active teams...")
        idle_teams = [t for t in teams if t.status == "idle"]
        pending_tasks = await session.execute(
            select(Task).where(Task.status == "pending").order_by(Task.priority).limit(len(idle_teams))
        )
        pending_list = pending_tasks.scalars().all()

        assignments = 0
        for task, team in zip(pending_list[:3], idle_teams[:3]):
            task.status = "assigned"
            task.assigned_team_id = team.id
            task.assigned_at = datetime.now(timezone.utc)
            team.status = "busy"
            assignments += 1
            print(f"  📋 Task #{task.id} ({task.priority}) → {team.name}")

        # Log system event
        event = SystemEvent(
            event_type="demo_setup",
            description=(
                f"Demo senaryo yüklendi: M{earthquake['magnitude']} {earthquake['location']} — "
                f"{result['zones_created']} bölge, {result['tasks_created']} görev, "
                f"{len(teams)} ekip, {assignments} aktif atama"
            ),
        )
        session.add(event)
        await session.commit()

        # --- Summary ---
        total_idle = sum(1 for t in teams if t.status == "idle")
        total_busy = sum(1 for t in teams if t.status == "busy")
        total_offline = sum(1 for t in teams if t.status == "offline")

        print("\n" + "=" * 60)
        print("  ✅ DEMO SCENARIO READY")
        print("=" * 60)
        print(f"  📡 Earthquake: M{earthquake['magnitude']} {earthquake['location']}")
        print(f"  🗺️  Zones:     {result['zones_created']}")
        print(f"  📋 Tasks:     {result['tasks_created']}")
        print(f"  👥 Teams:     {len(teams)} (🟢{total_idle} idle, 🔴{total_busy} busy, ⚫{total_offline} offline)")
        print(f"  🎯 Assigned:  {assignments} tasks actively in progress")
        print(f"  🤖 AI:        {analysis_method}")
        print(f"\n  Start the server:  uvicorn main:app --host 0.0.0.0 --port 8000")
        print(f"  Open admin:        http://localhost:5173")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run())
