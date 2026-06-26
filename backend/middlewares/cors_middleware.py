from flask_cors import CORS


def register_cors(app):
    """Enable CORS for all routes.

    The `ngrok-skip-browser-warning` header is explicitly allowed so that
    fetch requests from the React Native / Expo frontend bypass ngrok's
    browser-warning interstitial page when using the free ngrok tunnel.
    """
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        allow_headers=["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
        expose_headers=["ngrok-skip-browser-warning"],
    )
