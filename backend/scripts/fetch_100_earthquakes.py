import asyncio
import httpx
from datetime import datetime

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, async_session, init_db
from models.earthquake import Earthquake
from sqlalchemy import select

KANDILLI_API_URL = "https://api.orhanaydogdu.com.tr/deprem/kandilli/live?limit=100"

async def fetch_and_store():
    # Ensure tables exist
    await init_db()

    print(f"Fetching data from {KANDILLI_API_URL}...")
    async with httpx.AsyncClient() as client:
        response = await client.get(KANDILLI_API_URL)
        data = response.json()

    results = data.get("result", [])
    print(f"Found {len(results)} earthquakes.")

    async with async_session() as session:
        new_count = 0
        for eq_data in results:
            eq_id = eq_data.get("earthquake_id")
            if not eq_id:
                continue

            # Check if it already exists
            existing = await session.execute(
                select(Earthquake).where(Earthquake.earthquake_id == eq_id)
            )
            if existing.scalar_one_or_none():
                continue

            # Parse date
            date_time_str = eq_data.get("date_time")
            dt = datetime.strptime(date_time_str, "%Y-%m-%d %H:%M:%S")

            # Extract coords
            coords = eq_data.get("geojson", {}).get("coordinates", [0, 0])
            lng = float(coords[0])
            lat = float(coords[1])

            new_eq = Earthquake(
                earthquake_id=eq_id,
                title=eq_data.get("title", "Bilinmeyen"),
                magnitude=float(eq_data.get("mag", 0.0)),
                depth_km=float(eq_data.get("depth", 0.0)),
                lat=lat,
                lng=lng,
                date_time=dt,
                provider=eq_data.get("provider"),
                geojson=eq_data.get("geojson"),
                location_properties=eq_data.get("location_properties")
            )
            session.add(new_eq)
            new_count += 1
        
        await session.commit()
        print(f"Successfully inserted {new_count} new earthquakes to the database.")

if __name__ == "__main__":
    asyncio.run(fetch_and_store())
