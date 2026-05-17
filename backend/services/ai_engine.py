"""Gemini AI integration for zone prioritization and task generation.

Uses response_mime_type="application/json" for strict structured output.
Falls back to rule-based scoring when Gemini is unavailable.
"""

import json
import math
from typing import Optional
from datetime import datetime, timezone

from config import GEMINI_API_KEY


# --- Advanced Weighted Mathematical Fallback Scoring ---

def calculate_priority_score_fallback(
    magnitude: float,
    depth_km: float,
    distance_km: float,
    population_density: int = 0,
    old_building_ratio: float = 0.0,
) -> float:
    # 1. Seismic Energy Base (Exponential scale mapping)
    # Earthquakes under 3.5 have minimal destructive energy.
    if magnitude < 3.5:
        return 1.0
    
    # Energy scales exponentially with magnitude
    energy_factor = math.exp(magnitude - 4.5) 
    
    # 2. Depth Attenuation (Shallower = exponentially more surface damage)
    # A 5km depth is vastly more destructive than a 30km depth
    depth_attenuation = 20.0 / (depth_km + 5.0) 
    
    # 3. Distance Decay (Inverse scaling)
    distance_factor = 50.0 / (distance_km + 10.0) 
    
    # 4. Vulnerability Modifiers
    # Normalize population impact (assume 20,000+ is highly dense for a specific zone)
    pop_factor = min(2.0, population_density / 20000.0)
    # Old buildings act as a massive risk multiplier (0.0 to 1.0 ratio -> up to +1.5x risk)
    bldg_factor = 1.0 + (old_building_ratio * 1.5)
    
    # 5. Raw Impact Calculation
    raw_score = (energy_factor * depth_attenuation * distance_factor) * (1.0 + pop_factor) * bldg_factor
    
    # 6. Logarithmic Normalization to 1.0 - 5.0 scale
    # We use log1p to elegantly squash massive raw scores into our 5-point scale
    if raw_score <= 0:
        final_score = 1.0
    else:
        # Tuning factor (0.8) adjusts how fast it reaches 5.0
        final_score = 1.0 + (math.log1p(raw_score) * 0.8)
        
    return round(max(1.0, min(5.0, final_score)), 1)


def classify_priority(score: float) -> str:
    """Convert a priority score to KRİTİK/YÜKSEK/ORTA/DÜŞÜK classification."""
    if score >= 4.0:
        return "KRİTİK"
    elif score >= 3.0:
        return "YÜKSEK"
    elif score >= 2.0:
        return "ORTA"
    else:
        return "DÜŞÜK"


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


def calculate_impact_radius(magnitude: float, depth_km: float) -> float:
    """Calculate the physical impact radius in km using a seismological heuristic.
    
    Rule of thumb: 
    - Radius scales exponentially with magnitude.
    - Depth modifier: shallow earthquakes (<15km) increase surface impact, deep ones diffuse it.
    """
    # Base radius calculation (simplified empirical formula)
    base_radius = math.pow(10, (magnitude / 2.0) - 0.5) * 5
    
    # Depth modifier
    if depth_km <= 10.0:
        depth_modifier = 1.4
    elif depth_km <= 30.0:
        depth_modifier = 1.0
    else:
        depth_modifier = max(0.4, 30.0 / depth_km)
        
    return round(base_radius * depth_modifier, 2)


# --- Gemini AI Integration (Structured Output) ---

# JSON schema for Gemini's response_schema parameter
ZONE_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "analysis_timestamp": {"type": "string"},
        "confidence_score": {"type": "number"},
        "reasoning": {"type": "string"},
        "zones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "lat": {"type": "number"},
                    "lng": {"type": "number"},
                    "radius_m": {"type": "number"},
                    "risk_level": {
                        "type": "string",
                        "enum": ["DÜŞÜK", "ORTA", "YÜKSEK", "KRİTİK"]
                    },
                    "priority_score": {"type": "number"},
                    "estimated_casualties": {"type": "integer"},
                    "recommended_team_count": {"type": "integer"},
                    "risk_factors": {"type": "string"},
                    "polygon_coordinates": {
                        "type": "array",
                        "description": "Array of [lat, lng] representing an irregular, organic, elliptical polygon showing realistic seismic damage contour.",
                        "items": {
                            "type": "array",
                            "items": {"type": "number"}
                        }
                    }
                },
                "required": [
                    "name", "lat", "lng", "radius_m", "risk_level",
                    "priority_score", "estimated_casualties", "recommended_team_count", "risk_factors", "polygon_coordinates"
                ],
            },
        },
        "tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "zone_name": {"type": "string"},
                    "action_type": {"type": "string"},
                    "priority": {
                        "type": "string",
                        "enum": ["DÜŞÜK", "ORTA", "YÜKSEK", "KRİTİK"]
                    },
                    "description": {"type": "string"},
                    "required_teams": {"type": "integer"},
                },
                "required": ["zone_name", "action_type", "priority", "description"],
            },
        },
    },
    "required": ["zones", "tasks", "confidence_score", "reasoning"],
}


async def analyze_with_gemini(
    earthquake_data: dict,
    zones_data: list[dict],
) -> dict:
    """Use Gemini API with structured JSON output to analyze earthquake data.

    Calculates impact radius mathematically first, feeds it to the AI prompt.
    Falls back to offline rule-based triage on any failure.
    """
    mag = earthquake_data.get('magnitude', 5.0)
    depth = earthquake_data.get('depth_km', 10.0)
    
    # Phase 6: Rupture length formula for accurate simulation
    rupture_length_km = math.pow(10, (0.69 * mag) - 3.22)
    impact_radius_km = calculate_impact_radius(mag, depth)

    # Phase 4: Strict dumb proxy bypass for < 4.0
    if mag < 4.0:
        print("[AI] Magnitude < 4.0 detected. Bypassing AI, assigning DÜŞÜK priority and 1 Observation Task.")
        return {
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "confidence_score": 1.0,
            "reasoning": "4.0 şiddeti altındaki sarsıntılar fiziksel hasar yaratmaz. Sadece gözlem amaçlıdır.",
            "zones": [{
                "name": earthquake_data.get('location', 'Merkez'),
                "lat": earthquake_data.get('epicenter', {}).get('lat', earthquake_data.get('lat', 0.0)),
                "lng": earthquake_data.get('epicenter', {}).get('lng', earthquake_data.get('lng', 0.0)),
                "radius_m": 2000,
                "risk_level": "DÜŞÜK",
                "priority_score": 1.0,
                "estimated_casualties": 0,
                "recommended_team_count": 1,
                "risk_factors": "Düşük büyüklük, hasar beklenmiyor.",
                "polygon_coordinates": [[
                    earthquake_data.get('epicenter', {}).get('lat', earthquake_data.get('lat', 0.0)) - 0.01,
                    earthquake_data.get('epicenter', {}).get('lng', earthquake_data.get('lng', 0.0)) - 0.01
                ], [
                    earthquake_data.get('epicenter', {}).get('lat', earthquake_data.get('lat', 0.0)) + 0.01,
                    earthquake_data.get('epicenter', {}).get('lng', earthquake_data.get('lng', 0.0)) - 0.01
                ], [
                    earthquake_data.get('epicenter', {}).get('lat', earthquake_data.get('lat', 0.0)) + 0.01,
                    earthquake_data.get('epicenter', {}).get('lng', earthquake_data.get('lng', 0.0)) + 0.01
                ], [
                    earthquake_data.get('epicenter', {}).get('lat', earthquake_data.get('lat', 0.0)) - 0.01,
                    earthquake_data.get('epicenter', {}).get('lng', earthquake_data.get('lng', 0.0)) + 0.01
                ]]
            }],
            "tasks": [{
                "zone_name": earthquake_data.get('location', 'Merkez'),
                "action_type": "Gözlem",
                "priority": "DÜŞÜK",
                "description": "Bölgede rutin devriye ve gözlem görevi.",
                "required_teams": 1
            }]
        }

    if not GEMINI_API_KEY or GEMINI_API_KEY.endswith("_here"):
        print("[AI] Missing/Invalid Gemini API key, using offline fallback.")
        return offline_rule_based_triage(mag, depth)

    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)

        model = genai.GenerativeModel(
            "gemini-2.5-flash",
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=ZONE_ANALYSIS_SCHEMA,
                temperature=0.2,
            ),
        )

        prompt = _build_analysis_prompt(earthquake_data, zones_data, impact_radius_km)
        print(f"[AI] Calling Gemini API (Impact Radius: {impact_radius_km}km)...")
        
        response = await model.generate_content_async(prompt)
        parsed = json.loads(response.text)

        if "zones" not in parsed or "tasks" not in parsed:
            raise ValueError("Missing 'zones' or 'tasks' in Gemini JSON output")

        print(f"[AI] Gemini analysis complete: {len(parsed['zones'])} zones, {len(parsed['tasks'])} tasks")
        return parsed

    except Exception as e:
        print(f"[AI] Gemini API failed: {e}. Falling back to offline triage.")
        return offline_rule_based_triage(mag, depth)


def _build_analysis_prompt(earthquake_data: dict, zones_data: list[dict], impact_radius_km: float) -> str:
    """Build the analysis prompt for Gemini including the calculated impact radius."""

    regions = earthquake_data.get("affected_regions", zones_data)
    
    # Simulate building density/parcel data for the radius
    simulated_density = int(impact_radius_km * 1200)

    return f"""Sen baş sismolog ve afet yönetimi yapay zeka uzmanısın.

DEPREM VERİLERİ:
- Büyüklük: {earthquake_data.get('magnitude', 'N/A')}
- Derinlik: {earthquake_data.get('depth_km', 'N/A')} km
- Merkez Üssü: {earthquake_data.get('epicenter', {}).get('lat', earthquake_data.get('lat', 'N/A'))}, {earthquake_data.get('epicenter', {}).get('lng', earthquake_data.get('lng', 'N/A'))}
- Hesaplanmış Etki Yarıçapı: {impact_radius_km} km
- Kırılma Uzunluğu (Rupture Length: 10^(0.69*M - 3.22)): {earthquake_data.get('rupture_length_km', 'N/A')} km
- Tahmini Artçı Şok: {earthquake_data.get('estimated_aftershocks', 'N/A')} adet / 6 saat
- Simüle Edilen Bina Yoğunluğu: Etki alanında yaklaşık {simulated_density} bina.

GÖREV:
Yukarıdaki sismik verilere dayanarak risk analizi yap.

ÖNEMLİ COĞRAFİ KURAL (PHASE 6): 'polygon_coordinates' için rupture length (Kırılma Uzunluğu) formülünü kullanarak asimetrik, eliptik ve organik çokgen koordinatları ([lat, lng] formatında) üretin. Kesinlikle kare veya düzgün altıgen çizmeyin!

ÖNEMLİ ÖNCELİK KURALI: `risk_level` ve `priority` alanları SADECE şu değerlerden biri olmalıdır: "DÜŞÜK", "ORTA", "YÜKSEK", "KRİTİK".

CRITICAL SYSTEM RULE: You MUST return EXACTLY ONE (1) zone polygon. You MUST return A MAXIMUM OF 3 TASKS. If you return 4 or more tasks, the system will crash. Focus ONLY on the absolute epicenter.
CRITICAL: The JSON 'zones' array MUST contain EXACTLY ONE (1) object. The 'tasks' array can contain up to 3 objects. Do not generate multiple zones.
RULE 3: Priority MUST scale with magnitude. Do NOT output KRİTİK for anything under Mag 6.0.

Lütfen aşağıdaki JSON formatında kesin bir çıktı ver:
1. 'zones' dizisini oluştur: Sadece 1 bölge olacak. Merkez koordinatları etrafında.
2. 'tasks' dizisini oluştur: Maksimum 3 görev.
3. Genel analiz için 'confidence_score' ve 'reasoning' (1-2 cümle) ekle.

Sadece JSON dön. Şemaya (ZONE_ANALYSIS_SCHEMA) tam olarak uy."""


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
            "recommended_team_count": min(3, estimate_team_count(score, pop)),
            "risk_factors": (
                f"Episantra {region.get('distance_to_epicenter_km', '?')}km, "
                f"eski bina oranı %{int(ratio * 100)}, "
                f"nüfus yoğunluğu {region.get('population_density', '?')}/km²"
            ),
        })

    return {
        "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
        "confidence_score": 0.65,
        "reasoning": "Kural tabanlı çevrimdışı analiz — AI modeline erişilemedi, deterministik hesaplama kullanıldı.",
        "zones": zones,
    }


def offline_rule_based_triage(magnitude: float, depth: float) -> dict:
    """Emergency offline triage when both Gemini AND network are down.
    
    Returns basic task generation parameters based on magnitude/depth only.
    """
    if magnitude >= 7.0:
        priority = "KRİTİK"
        team_count = 5
        task_types = ["arama_kurtarma", "saglik", "lojistik", "hasar_tespit", "tahliye"]
        confidence = 0.4
    elif magnitude >= 6.0:
        priority = "YÜKSEK"
        team_count = 3
        task_types = ["arama_kurtarma", "hasar_tespit", "saglik"]
        confidence = 0.5
    elif magnitude >= 5.0:
        priority = "ORTA"
        team_count = 2
        task_types = ["hasar_tespit", "saglik"]
        confidence = 0.6
    elif magnitude >= 4.0:
        priority = "DÜŞÜK"
        team_count = 1
        task_types = ["hasar_tespit"]
        confidence = 0.7
    else:
        priority = "DÜŞÜK"
        team_count = 1
        task_types = ["izleme"]
        confidence = 0.85

    shallow_multiplier = 1.5 if depth <= 10 else 1.0 if depth <= 30 else 0.8
    team_count = max(1, int(team_count * shallow_multiplier))

    return {
        "priority": priority,
        "recommended_team_count": team_count,
        "task_types": task_types,
        "confidence_score": confidence,
        "reasoning": f"Çevrimdışı kural motoru: M{magnitude}, {depth}km derinlik → {priority} öncelik",
    }
