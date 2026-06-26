from datetime import datetime, timezone

VALID_STATES = ("on", "off")
VALID_MODES  = ("automatic", "manual")


def create_fan_log(state: str, mode: str) -> dict:
    state = state.lower()
    mode  = mode.lower()
    if state not in VALID_STATES:
        raise ValueError(f"Invalid state '{state}'. Must be one of {VALID_STATES}")
    if mode not in VALID_MODES:
        raise ValueError(f"Invalid mode '{mode}'. Must be one of {VALID_MODES}")
    return {
        "state": state,
        "mode": mode,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def format_log(doc: dict) -> dict:
    if doc is None:
        return None
    return {
        "id": str(doc.get("_id", "")),
        "state": doc.get("state", "off"),
        "mode": doc.get("mode", "automatic"),
        "timestamp": doc.get("timestamp", ""),
    }
