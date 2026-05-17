import math

def calculate_rupture_length(magnitude: float) -> float:
    """Wells & Coppersmith formula (Rupture Length)"""
    # rupture_length_km = 10 ** (0.69 * magnitude - 3.22)
    return round(10 ** (0.69 * magnitude - 3.22), 2)

def predict_aftershocks(time_since_mainshock_hours: float, base_count: int = 15, magnitude: float = 6.0) -> int:
    """Omori's Law (Aftershock Prediction)
    rate = K / (t + c) ** p
    """
    c = 0.1
    p = 1.1
    # Base K on magnitude
    K = base_count * (magnitude / 5.0)
    rate = K / ((time_since_mainshock_hours + c) ** p)
    return max(1, int(rate))
