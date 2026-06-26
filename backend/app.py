import os

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from flask import Flask, jsonify
from pymongo import MongoClient

# Middlewares
from middlewares.cors_middleware   import register_cors
from middlewares.error_handler     import register_error_handlers
from middlewares.logger_middleware import register_logger

# Controllers / Blueprints
from controllers.temperature_controller import temperature_bp
from controllers.uv_controller           import uv_bp
from controllers.fan_controller          import fan_bp
from controllers.buzzer_controller       import buzzer_bp

# MQTT Client (replaces serial_reader)
from mqtt_client import MQTTClient


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")

    # MongoDB
    db_uri = os.getenv("DB_URI", "mongodb://localhost:27017/micro-demo")
    client = MongoClient(db_uri)
    app.db = client.get_default_database()

    # MQTT Client
    mqtt_broker    = os.getenv("MQTT_BROKER")
    mqtt_port      = int(os.getenv("MQTT_PORT"))
    mqtt_client_id = os.getenv("MQTT_CLIENT_ID")

    mqtt = MQTTClient(
        broker=mqtt_broker,
        port=mqtt_port,
        client_id=mqtt_client_id,
        db=app.db,
    )
    app.mqtt_client = mqtt
    mqtt.start()

    # Middlewares
    register_cors(app)
    register_logger(app)
    register_error_handlers(app)

    # Blueprints
    app.register_blueprint(temperature_bp)
    app.register_blueprint(uv_bp)
    app.register_blueprint(fan_bp)
    app.register_blueprint(buzzer_bp)

    # MQTT Status Endpoint
    @app.route("/api/mqtt/status", methods=["GET"])
    def mqtt_status():
        state = mqtt.get_latest_state()
        return jsonify({
            "connected":    state["connected"],
            "broker":       mqtt_broker,
            "port":         mqtt_port,
            "last_updated": state.get("last_updated"),
        }), 200

    # Live Sensor State Endpoint (single in-memory snapshot from last MQTT message)
    @app.route("/api/sensors/live", methods=["GET"])
    def sensors_live():
        state = mqtt.get_latest_state()
        return jsonify({
            "connected":    state.get("connected", False),
            "temperature":  state.get("temperature"),
            "humidity":     state.get("humidity"),
            "uv_index":     state.get("uv_index"),
            "fan":          state.get("fan", False),
            "buzzer":       state.get("buzzer", False),
            "fan_auto":     state.get("fan_auto", True),
            "buzzer_auto":  state.get("buzzer_auto", True),
            "last_updated": state.get("last_updated"),
        }), 200

    # Health Check
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    return app


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app  = create_app()
    app.run(host="0.0.0.0", port=port,
            debug=(os.getenv("FLASK_ENV") == "development"))
