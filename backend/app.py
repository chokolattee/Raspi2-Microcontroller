import os
import sys

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from flask import Flask, jsonify
from pymongo import MongoClient

# Middlewares 
from middlewares.cors_middleware  import register_cors
from middlewares.error_handler    import register_error_handlers
from middlewares.logger_middleware import register_logger

# Controllers / Blueprints 
from controllers.temperature_controller import temperature_bp
from controllers.uv_controller           import uv_bp
from controllers.fan_controller          import fan_bp
from controllers.buzzer_controller       import buzzer_bp

# Serial Reader
from serial_reader import SerialReader


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")

    # MongoDB
    db_uri = os.getenv("DB_URI", "mongodb://localhost:27017/micro-demo")
    client = MongoClient(db_uri)
    app.db = client.get_default_database()

    # Serial Reader
    serial_port = os.getenv("SERIAL_PORT", "COM3")
    baud_rate   = int(os.getenv("BAUD_RATE", "9600"))
    reader      = SerialReader(port=serial_port, baud_rate=baud_rate, db=app.db)
    app.serial_reader = reader
    reader.start()

    # Middlewares 
    register_cors(app)
    register_logger(app)
    register_error_handlers(app)

    # Blueprints
    app.register_blueprint(temperature_bp)
    app.register_blueprint(uv_bp)
    app.register_blueprint(fan_bp)
    app.register_blueprint(buzzer_bp)

    # Serial Status Endpoint
    @app.route("/api/serial/status", methods=["GET"])
    def serial_status():
        state = reader.get_latest_state()
        return jsonify({
            "connected":    state["connected"],
            "port":         serial_port,
            "baud_rate":    baud_rate,
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
    app.run(host="0.0.0.0", port=port, debug=(os.getenv("FLASK_ENV") == "development"))
