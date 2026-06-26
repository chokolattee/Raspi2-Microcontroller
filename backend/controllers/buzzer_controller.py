from flask import Blueprint, jsonify, request, current_app
from models.buzzer_log import format_log, create_buzzer_log

buzzer_bp = Blueprint("buzzer", __name__, url_prefix="/api/buzzer")


@buzzer_bp.route("/latest", methods=["GET"])
def get_latest():
    db  = current_app.db
    doc = db.buzzer_logs.find_one(sort=[("timestamp", -1)])
    if doc is None:
        return jsonify({"message": "No data yet"}), 404
    return jsonify(format_log(doc)), 200


@buzzer_bp.route("/history", methods=["GET"])
def get_history():
    db   = current_app.db
    docs = list(
        db.buzzer_logs.find(
            {}, {"_id": 1, "state": 1, "mode": 1, "timestamp": 1}
        )
        .sort("timestamp", -1)
        .limit(50)
    )
    return jsonify([format_log(d) for d in docs]), 200


@buzzer_bp.route("/control", methods=["POST"])
def control():
    body  = request.get_json(force=True, silent=True) or {}
    mode  = body.get("mode",  "automatic").lower()
    state = body.get("state", "off").lower()

    if mode not in ("manual", "automatic"):
        return jsonify({"error": "mode must be 'manual' or 'automatic'"}), 400

    if mode == "manual" and state not in ("on", "off"):
        return jsonify({"error": "state must be 'on' or 'off' when mode is manual"}), 400

    mqtt = current_app.mqtt_client

    if mode == "automatic":
        # Tell ESP32 to return to UV threshold logic
        mqtt.publish_command("esp32/buzzer/cmd", "AUTO")
        state = "off"   # Reflect unknown state until next sensor publish
    else:
        cmd = "ON" if state == "on" else "OFF"
        mqtt.publish_command("esp32/buzzer/cmd", cmd)

    # Persist intent log immediately
    db  = current_app.db
    doc = create_buzzer_log(state=state, mode=mode)
    db.buzzer_logs.insert_one(doc)

    return jsonify({"success": True, "mode": mode, "state": state}), 200
