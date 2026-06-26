from flask import Blueprint, jsonify, current_app
from models.temperature_reading import format_reading

temperature_bp = Blueprint("temperature", __name__, url_prefix="/api/temperature")


@temperature_bp.route("/latest", methods=["GET"])
def get_latest():
    db = current_app.db
    doc = db.temperature_readings.find_one(sort=[("timestamp", -1)])
    if doc is None:
        return jsonify({"message": "No data yet"}), 404
    return jsonify(format_reading(doc)), 200


@temperature_bp.route("/history", methods=["GET"])
def get_history():
    db = current_app.db
    docs = list(
        db.temperature_readings.find(
            {}, {"_id": 1, "value": 1, "humidity": 1, "timestamp": 1}
        )
        .sort("timestamp", -1)
        .limit(50)
    )
    return jsonify([format_reading(d) for d in docs]), 200
