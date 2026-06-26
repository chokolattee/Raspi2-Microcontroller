from datetime import datetime, timezone


def raw_to_uv_index(raw: int) -> float:
    voltage_mv = (raw / 4095.0) * 3300.0
    uv_index = voltage_mv / 100.0
    return round(max(uv_index, 0.0), 2)


def create_uv_reading(raw_value: int) -> dict:
    uv_index = raw_to_uv_index(raw_value)
    return {
        "value": raw_value,
        "uv_index": uv_index,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def format_reading(doc: dict) -> dict:
    if doc is None:
        return None
    return {
        "id": str(doc.get("_id", "")),
        "value": doc.get("value", 0),
        "uv_index": doc.get("uv_index", 0),
        "timestamp": doc.get("timestamp", ""),
    }
