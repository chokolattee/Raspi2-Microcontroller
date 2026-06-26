from flask import Blueprint, jsonify, request, current_app
from models.fan_log import format_log, create_fan_log

fan_bp = Blueprint("fan", __name__, url_prefix="/api/fan")


@fan_bp.route("/latest", methods=["GET"])
def get_latest():
    db = current_app.db
    doc = db.fan_logs.find_one(sort=[("timestamp", -1)])
    if doc is None:
        return jsonify({"message": "No data yet"}), 404
    return jsonify(format_log(doc)), 200


@fan_bp.route("/history", methods=["GET"])
def get_history():
    db = current_app.db
    docs = list(
        db.fan_logs.find(
            {}, {"_id": 1, "state": 1, "mode": 1, "timestamp": 1}
        )
        .sort("timestamp", -1)
        .limit(50)
    )
    return jsonify([format_log(d) for d in docs]), 200


@fan_bp.route("/control", methods=["POST"])
def control():
    body = request.get_json(force=True, silent=True) or {}
    mode  = body.get("mode", "automatic").lower()
    state = body.get("state", "off").lower()

    if mode not in ("manual", "automatic"):
        return jsonify({"error": "mode must be 'manual' or 'automatic'"}), 400

    if mode == "manual" and state not in ("on", "off"):
        return jsonify({"error": "state must be 'on' or 'off' when mode is manual"}), 400

    serial_reader = current_app.serial_reader
    if mode == "automatic":
        serial_reader.send_command("FAN:AUTO")
        state = "off"
    else:
        cmd = "FAN:ON" if state == "on" else "FAN:OFF"
        serial_reader.send_command(cmd)
    db  = current_app.db
    doc = create_fan_log(state=state, mode=mode)
    db.fan_logs.insert_one(doc)

    return jsonify({"success": True, "mode": mode, "state": state}), 200
