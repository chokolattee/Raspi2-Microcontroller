from flask_cors import CORS


def register_cors(app):
    """Enable CORS for all routes."""
    CORS(app, resources={r"/api/*": {"origins": "*"}})
