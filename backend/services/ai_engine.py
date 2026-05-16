"""Gemini AI integration for zone prioritization and task generation."""

import json
from typing import Optional
from datetime import datetime, timezone

from config import GEMINI_API_KEY


# --- Fallback Rule-Based Scoring (works without API) ---

def calculate_priority_score_fallback(
    magnitude: float,
    depth_km: float,
    distance_km: float,
    population_density: int = 0,
    old_building_ratio: float = 0.0,
) -> float:
    """Rule-based zone priority score calculation.

    Fallback when Gemini API is unavailable.
    Returns a score between 1.0 (low) and 5.0 (critical).
    """
    # Magnitude factor (most important)
    if magnitude >= 7.0:
        mag_score = 5.0
    elif magnitude >= 6.0:
        mag_score = 4.0
    elif magnitude >= 5.0:
        mag_score = 3.0
    elif magnitude >= 4.0:
        mag_score = 2.0
    else:
        mag_score = 1.0

    # Depth factor (shallow = more dangerous)
    if depth_km <= 10:
        depth_score = 5.0
    elif depth_km <= 30:
        depth_score = 4.0
    elif depth_km <= 70:
        depth_score = 3.0
    else:
        depth_score = 2.0

    # Distance factor (closer = more dangerous)
    if distance_km <= 10:
        dist_score = 5.0
    elif distance_km <= 30:
        dist_score = 4.0
    elif distance_km <= 50:
        dist_score = 3.0
    elif distance_km <= 100:
        dist_score = 2.0
    else:
        dist_score = 1.0

    # Population density factor
    if population_density >= 10000:
        pop_score = 5.0
    elif population_density >= 5000:
        pop_score = 4.0
    elif population_density >= 1000:
        pop_score = 3.0
    else:
        pop_score = 2.0

    # Old building ratio factor
    building_score = 1.0 + (old_building_ratio * 4.0)  # 0.0 → 1.0, 1.0 → 5.0

    # Weighted average
    score = (
        mag_score * 0.30
        + depth_score * 0.15
        + dist_score * 0.25
        + pop_score * 0.15
        + building_score * 0.15
    )

    return round(min(max(score, 1.0), 5.0), 1)


def classify_priority(score: float) -> str:
    """Convert a priority score to RED/YELLOW/GREEN classification."""
    if score >= 3.5:
        return "RED"
    elif score >= 2.5:
        return "YELLOW"
    else:
        return "GREEN"


def estimate_team_count(score: float, task_count: int) -> int:
    """Estimate recommended team count based on priority and task volume."""
    base = 1
    if score >= 4.0:
        base = 3
    elif score >= 3.0:
        base = 2

    # Add more teams for high task counts
    extra = task_count // 10
    return base + extra


# --- Gemini AI Integration ---

async def analyze_with_gemini(earthquake_data: dict, zones_data: list[dict]) -> Optional[dict]:
    """Use Gemini API to analyze earthquake data and generate zone priorities.

    Args:
        earthquake_data: Dict with magnitude, depth, epicenter coordinates.
        zones_data: List of zone dicts with population, building info.

    Returns:
        Dict with zone priorities and recommended tasks, or None if API fails.
    """
    if not GEMINI_API_KEY:
        print("[AI] No Gemini API key configured, using fallback scoring")
        return None

    try:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.0-flash")

        prompt = _build_analysis_prompt(earthquake_data, zones_data)

        response = await model.generate_content_async(prompt)
        result_text = response.text

        # Try to parse JSON from Gemini response
        parsed = _parse_gemini_response(result_text)
        return parsed

    except Exception as e:
        print(f"[AI] Gemini API error: {e}")
        return None


def _build_analysis_prompt(earthquake_data: dict, zones_data: list[dict]) -> str:
    """Build the analysis prompt for Gemini."""
    return f"""Sen bir afet yönetimi uzmanısın. Aşağıdaki deprem verilerini analiz et ve her bölge için öncelik skoru belirle.

DEPREM VERİLERİ:
- Büyüklük: {earthquake_data.get('magnitude', 'N/A')}
- Derinlik: {earthquake_data.get('depth_km', 'N/A')} km
- Merkez Üssü: {earthquake_data.get('lat', 'N/A')}, {earthquake_data.get('lng', 'N/A')}
- Tarih: {earthquake_data.get('date', 'N/A')}

BÖLGE VERİLERİ:
{json.dumps(zones_data, ensure_ascii=False, indent=2)}

Her bölge için şunları döndür:
1. priority_score (1.0-5.0 arası, 5.0 en kritik)
2. priority_class (RED/YELLOW/GREEN)
3. estimated_casualties (tahmini etkilenen kişi)
4. recommended_teams (önerilen ekip sayısı)
5. recommended_tasks (yapılması gereken görevler listesi)
6. risk_factors (risk faktörleri açıklaması)

JSON formatında yanıt ver:
{{
  "analysis_timestamp": "ISO timestamp",
  "zones": [
    {{
      "zone_id": 1,
      "zone_name": "...",
      "priority_score": 4.5,
      "priority_class": "RED",
      "estimated_casualties": 150,
      "recommended_teams": 5,
      "risk_factors": "...",
      "recommended_tasks": [
        {{
          "description": "...",
          "priority": "RED",
          "building_type": "residential",
          "estimated_damage": "severe"
        }}
      ]
    }}
  ]
}}"""


def _parse_gemini_response(text: str) -> Optional[dict]:
    """Extract JSON from Gemini response text."""
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON block in markdown code fences
    import re
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find anything that looks like JSON
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    print("[AI] Could not parse Gemini response as JSON")
    return None


def generate_tasks_from_analysis(zone_id: int, analysis: dict) -> list[dict]:
    """Convert AI analysis results into task creation payloads."""
    tasks = []
    zone_data = None

    for z in analysis.get("zones", []):
        if z.get("zone_id") == zone_id:
            zone_data = z
            break

    if not zone_data:
        return tasks

    for rec_task in zone_data.get("recommended_tasks", []):
        tasks.append({
            "zone_id": zone_id,
            "priority": zone_data.get("priority_class", "YELLOW"),
            "lat": 0.0,  # To be filled with actual coordinates
            "lng": 0.0,
            "building_type": rec_task.get("building_type", "residential"),
            "reported_damage_level": rec_task.get("estimated_damage", "moderate"),
            "notes": rec_task.get("description", ""),
        })

    return tasks
