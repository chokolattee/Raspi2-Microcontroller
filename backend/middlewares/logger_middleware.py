import logging
import time

logger = logging.getLogger("calungsod")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def register_logger(app):
    @app.before_request
    def log_request():
        from flask import request
        request._start_time = time.time()
        logger.info("→ %s %s", request.method, request.path)

    @app.after_request
    def log_response(response):
        from flask import request
        duration_ms = round((time.time() - getattr(request, "_start_time", time.time())) * 1000)
        logger.info("← %s %s %d (%dms)", request.method, request.path, response.status_code, duration_ms)
        return response
