"""Open-Meteo weather and place search for the shared home display.

Weather is optional per family: nothing is requested until a family admin
stores a place. Only coordinates (and the search text while picking a
place) leave the server. Results are cached in-process so polling
displays do not hit Open-Meteo on every refresh, and failures degrade to
"no weather" instead of breaking the display.
"""

from __future__ import annotations

import json
import logging
import threading
import time as time_module
import urllib.parse
import urllib.request
from typing import Any, Optional

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
REQUEST_TIMEOUT_SECONDS = 6
FORECAST_TTL_SECONDS = 15 * 60
FAILURE_TTL_SECONDS = 5 * 60
HOURLY_POINTS = 16
RAIN_PROBABILITY_THRESHOLD = 50

_cache: dict[str, tuple[float, Optional[dict[str, Any]]]] = {}
_cache_lock = threading.Lock()


def _fetch_json(url: str, params: dict[str, Any]) -> Any:
    request = urllib.request.Request(
        f"{url}?{urllib.parse.urlencode(params)}",
        headers={"Accept": "application/json", "User-Agent": "Tribu"},
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:  # noqa: S310 - fixed https hosts
        return json.loads(response.read().decode("utf-8"))


def _int(value: Any) -> Optional[int]:
    return int(round(value)) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _day(daily: dict[str, Any], index: int) -> Optional[dict[str, Any]]:
    try:
        return {
            "date": daily["time"][index],
            "code": _int(daily["weather_code"][index]),
            "min": _int(daily["temperature_2m_min"][index]),
            "max": _int(daily["temperature_2m_max"][index]),
            "precipitation_probability": _int(daily["precipitation_probability_max"][index]),
        }
    except (KeyError, IndexError, TypeError):
        return None


def parse_forecast(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Reduce an Open-Meteo forecast to what the display renders."""
    current = payload.get("current") or {}
    hourly = payload.get("hourly") or {}
    daily = payload.get("daily") or {}
    now_text = current.get("time")
    temperature = _int(current.get("temperature_2m"))
    if not now_text or temperature is None:
        return None
    current_hour = str(now_text)[:13]

    hours: list[dict[str, Any]] = []
    times = hourly.get("time") or []
    for index, stamp in enumerate(times):
        if str(stamp)[:13] < current_hour:
            continue
        try:
            hours.append({
                "time": stamp,
                "temperature": _int(hourly["temperature_2m"][index]),
                "code": _int(hourly["weather_code"][index]),
                "precipitation_probability": _int(hourly["precipitation_probability"][index]),
            })
        except (KeyError, IndexError, TypeError):
            break
        if len(hours) >= HOURLY_POINTS:
            break

    today = str(now_text)[:10]
    rain_from = next(
        (
            hour["time"][11:16]
            for hour in hours
            if hour["time"].startswith(today)
            and (hour["precipitation_probability"] or 0) >= RAIN_PROBABILITY_THRESHOLD
        ),
        None,
    )
    return {
        "current_temperature": temperature,
        "current_code": _int(current.get("weather_code")),
        "current_is_day": current.get("is_day") != 0,
        "today": _day(daily, 0),
        "tomorrow": _day(daily, 1),
        "hourly": hours,
        "rain_from": rain_from,
        "observed_at": now_text,
    }


def get_forecast(latitude: float, longitude: float) -> Optional[dict[str, Any]]:
    """Return the cached display forecast for a place, or ``None`` when unavailable."""
    key = f"{latitude:.3f},{longitude:.3f}"
    now = time_module.monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached and cached[0] > now:
            return cached[1]
    try:
        payload = _fetch_json(FORECAST_URL, {
            "latitude": f"{latitude:.4f}",
            "longitude": f"{longitude:.4f}",
            "current": "temperature_2m,weather_code,is_day",
            "hourly": "temperature_2m,weather_code,precipitation_probability",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            "timezone": "auto",
            "forecast_days": 2,
        })
        forecast = parse_forecast(payload) if isinstance(payload, dict) else None
    except Exception as exc:  # network, TLS, JSON — all mean "no weather right now"
        logger.info("Weather forecast unavailable: %s", exc)
        forecast = None
    ttl = FORECAST_TTL_SECONDS if forecast else FAILURE_TTL_SECONDS
    with _cache_lock:
        _cache[key] = (now + ttl, forecast)
    return forecast


def search_places(query: str, language: str = "en") -> list[dict[str, Any]]:
    """Search Open-Meteo's geocoder; raises on network errors so callers can report them."""
    payload = _fetch_json(GEOCODING_URL, {"name": query, "count": 6, "language": language, "format": "json"})
    places = []
    for item in (payload or {}).get("results") or []:
        latitude, longitude = item.get("latitude"), item.get("longitude")
        if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
            continue
        places.append({
            "name": str(item.get("name") or "")[:120],
            "region": str(item.get("admin1") or "")[:120] or None,
            "country": str(item.get("country") or "")[:120] or None,
            "latitude": float(latitude),
            "longitude": float(longitude),
        })
    return places


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()

