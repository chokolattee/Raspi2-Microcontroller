from datetime import datetime, timezone


def create_temperature_reading(temperature: float, humidity: float) -> dict:
    return {
        "value": round(temperature, 2),
        "humidity": round(humidity, 2),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def format_reading(doc: dict) -> dict:
    if doc is None:
        return None
    return {
        "id": str(doc.get("_id", "")),
        "value": doc.get("value", 0),
        "humidity": doc.get("humidity", 0),
        "timestamp": doc.get("timestamp", ""),
    }
