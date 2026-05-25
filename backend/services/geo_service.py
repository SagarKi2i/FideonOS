from datetime import datetime, timezone


def ip_to_country(ip: str) -> str | None:
    """Return ISO 3166-1 alpha-2 country code for an IP, or None.
    Uses ip-api.com free tier (no key needed, 45 req/min limit).
    Falls back to None on any error — caller treats None as unknown.
    """
    if not ip or ip in ("127.0.0.1", "::1"):
        return None
    try:
        import httpx
        r = httpx.get(f"http://ip-api.com/json/{ip}?fields=countryCode", timeout=2)
        data = r.json()
        return data.get("countryCode") or None
    except Exception:
        return None


def ip_to_city(ip: str) -> str | None:
    if not ip or ip in ("127.0.0.1", "::1"):
        return None
    try:
        import httpx
        r = httpx.get(f"http://ip-api.com/json/{ip}?fields=city", timeout=2)
        data = r.json()
        return data.get("city") or None
    except Exception:
        return None


def is_impossible_travel(
    prev_country: str | None,
    prev_time: datetime | None,
    curr_country: str | None,
    threshold_minutes: int = 60,
) -> bool:
    if not prev_country or not curr_country or not prev_time:
        return False
    if prev_country == curr_country:
        return False
    now = datetime.now(timezone.utc)
    if prev_time.tzinfo is None:
        prev_time = prev_time.replace(tzinfo=timezone.utc)
    minutes_since = (now - prev_time).total_seconds() / 60
    return minutes_since < threshold_minutes
