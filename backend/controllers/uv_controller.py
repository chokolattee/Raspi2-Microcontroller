from flask import Blueprint, jsonify, current_app
from models.uv_reading import format_reading

uv_bp = Blueprint("uv", __name__, url_prefix="/api/uv")


@uv_bp.route("/latest", methods=["GET"])
def get_latest():
    db = current_app.db
    doc = db.uv_readings.find_one(sort=[("timestamp", -1)])
    if doc is None:
        return jsonify({"message": "No data yet"}), 404
    return jsonify(format_reading(doc)), 200


@uv_bp.route("/history", methods=["GET"])
def get_history():
    db = current_app.db
    docs = list(
        db.uv_readings.find(
            {}, {"_id": 1, "value": 1, "uv_index": 1, "timestamp": 1}
        )
        .sort("timestamp", -1)
        .limit(50)
    )
    return jsonify([format_reading(d) for d in docs]), 200
