"""Gemini AI integration for zone prioritization and task generation.

Uses response_mime_type="application/json" for strict structured output.
Falls back to rule-based scoring when Gemini is unavailable.
"""

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


def estimate_team_count(score: float, population: int = 0) -> int:
    """Estimate recommended team count based on priority and population."""
    base = 1
    if score >= 4.0:
        base = 3
    elif score >= 3.0:
        base = 2

    # Scale with population
    if population >= 300000:
        base += 2
    elif population >= 100000:
        base += 1

    return base


# --- Gemini AI Integration (Structured Output) ---

# JSON schema for Gemini's response_schema parameter
ZONE_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "analysis_timestamp": {"type": "string"},
        "zones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "priority_score": {"type": "number"},
                    "estimated_casualties": {"type": "integer"},
                    "recommended_team_count": {"type": "integer"},
                    "risk_factors": {"type": "string"},
                },
                "required": [
                    "name",
                    "priority_score",
                    "estimated_casualties",
                    "recommended_team_count",
                    "risk_factors",
                ],
            },
        },
    },
    "required": ["zones"],
}


async def analyze_with_gemini(
    earthquake_data: dict,
    zones_data: list[dict],
) -> Optional[dict]:
    """Use Gemini API with structured JSON output to analyze earthquake data.

    Args:
        earthquake_data: Dict with magnitude, depth, epicenter, affected_regions.
        zones_data: List of zone dicts with population, building info.

    Returns:
        Dict with zone priorities and recommended teams, or None if API fails.
    """
    if not GEMINI_API_KEY:
        print("[AI] No Gemini API key configured, using fallback scoring")
        return None

    try:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)

        # Use response_mime_type for strict JSON output
        model = genai.GenerativeModel(
            "gemini-2.0-flash",
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=ZONE_ANALYSIS_SCHEMA,
            ),
        )

        prompt = _build_analysis_prompt(earthquake_data, zones_data)

        response = await model.generate_content_async(prompt)
        result_text = response.text

        # With response_mime_type="application/json", output is guaranteed valid JSON
        parsed = json.loads(result_text)

        # Validate structure
        if "zones" not in parsed:
            print("[AI] Gemini response missing 'zones' key")
            return None

        print(f"[AI] Gemini analysis complete: {len(parsed['zones'])} zones")
        return parsed

    except Exception as e:
        print(f"[AI] Gemini API error: {e}")
        return None


def _build_analysis_prompt(earthquake_data: dict, zones_data: list[dict]) -> str:
    """Build the analysis prompt for Gemini."""

    # Use affected_regions from earthquake_data if available
    regions = earthquake_data.get("affected_regions", zones_data)

    return f"""Sen bir afet yönetimi uzmanısın. Aşağıdaki deprem verilerini analiz et ve her bölge için öncelik skoru belirle.

DEPREM VERİLERİ:
- Büyüklük: {earthquake_data.get('magnitude', 'N/A')}
- Derinlik: {earthquake_data.get('depth_km', 'N/A')} km
- Merkez Üssü: {earthquake_data.get('epicenter', {}).get('lat', earthquake_data.get('lat', 'N/A'))}, {earthquake_data.get('epicenter', {}).get('lng', earthquake_data.get('lng', 'N/A'))}
- Tarih: {earthquake_data.get('date', 'N/A')}

BÖLGE VERİLERİ:
{json.dumps(regions, ensure_ascii=False, indent=2)}

Her bölge için şunları hesapla:
1. priority_score: 1.0-5.0 arası (5.0 en kritik). Episantra yakınlık, eski bina oranı, nüfus yoğunluğu ve zemin tipini dikkate al.
2. estimated_casualties: tahmini etkilenen kişi sayısı
3. recommended_team_count: önerilen arama-kurtarma ekip sayısı
4. risk_factors: risk faktörleri açıklaması (Türkçe)

name alanı bölge adıyla eşleşmeli."""


def _parse_gemini_response(text: str) -> Optional[dict]:
    """Extract JSON from Gemini response text (legacy fallback)."""
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


def generate_fallback_analysis(earthquake_data: dict) -> dict:
    """Generate zone analysis using rule-based scoring (no API needed).

    This is the deterministic fallback used when Gemini is unavailable.
    """
    regions = earthquake_data.get("affected_regions", [])

    zones = []
    for region in regions:
        score = calculate_priority_score_fallback(
            magnitude=earthquake_data.get("magnitude", 5.0),
            depth_km=earthquake_data.get("depth_km", 20.0),
            distance_km=region.get("distance_to_epicenter_km", 50.0),
            population_density=region.get("population_density", 5000),
            old_building_ratio=region.get("old_building_ratio", 0.3),
        )

        pop = region.get("population", 100000)
        ratio = region.get("old_building_ratio", 0.3)
        estimated = int(pop * ratio * 0.002 * (score / 3.0))

        zones.append({
            "name": region["name"],
            "priority_score": score,
            "estimated_casualties": estimated,
            "recommended_team_count": estimate_team_count(score, pop),
            "risk_factors": (
                f"Episantra {region.get('distance_to_epicenter_km', '?')}km, "
                f"eski bina oranı %{int(ratio * 100)}, "
                f"nüfus yoğunluğu {region.get('population_density', '?')}/km²"
            ),
        })

    return {
        "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
        "zones": zones,
    }
