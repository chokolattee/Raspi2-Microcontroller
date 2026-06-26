import json
import logging
import threading
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from models.temperature_reading import create_temperature_reading
from models.uv_reading           import create_uv_reading, raw_to_uv_index
from models.fan_log              import create_fan_log
from models.buzzer_log           import create_buzzer_log

logger = logging.getLogger("mqtt_client")

RECONNECT_DELAY = 5   # seconds between reconnect attempts


class MQTTClient:
    """
    Persistent MQTT client that:
      - Subscribes to ``esp32/sensors`` and persists readings to MongoDB.
      - Publishes commands to ``esp32/fan/cmd`` and ``esp32/buzzer/cmd``.
      - Tracks fan/buzzer mode (automatic | manual) for actuator log entries.
      - Provides ``get_latest_state()`` for the /api/mqtt/status endpoint.
    """

    SENSOR_TOPIC  = "esp32/sensors"
    FAN_CMD       = "esp32/fan/cmd"
    BUZZER_CMD    = "esp32/buzzer/cmd"

    def __init__(self, broker: str, port: int, client_id: str, db):
        self.broker    = broker
        self.port      = port
        self.client_id = client_id
        self.db        = db

        self._lock = threading.Lock()

        # Latest parsed state (thread-safe via lock)
        self._latest: dict = {
            "connected":    False,
            "temperature":  None,
            "humidity":     None,
            "uv_index":     None,
            "fan":          False,
            "buzzer":       False,
            "fan_auto":     True,
            "buzzer_auto":  True,
            "last_updated": None,
        }

        # Track previous actuator states to avoid duplicate DB writes
        self._prev_fan_state    = None
        self._prev_buzzer_state = None
        self._fan_mode          = "automatic"
        self._buzzer_mode       = "automatic"

        # Build paho client
        self._client = mqtt.Client(client_id=self.client_id,
                                   clean_session=True,
                                   protocol=mqtt.MQTTv311)
        self._client.on_connect    = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message    = self._on_message

    # ── Public interface ──────────────────────────────────────────────────────

    def start(self):
        """Connect to broker and start the background network loop."""
        self._connect()
        self._client.loop_start()   # Runs on a daemon thread
        logger.info("MQTT client started (broker=%s:%d, id=%s)",
                    self.broker, self.port, self.client_id)

    def stop(self):
        """Gracefully disconnect."""
        self._client.loop_stop()
        self._client.disconnect()
        logger.info("MQTT client stopped")

    def publish_command(self, topic: str, payload: str):
        """
        Publish an actuator command (e.g. 'ON', 'OFF', 'AUTO') and
        update the internal mode tracking.
        """
        # Update mode tracking before publishing
        if topic == self.FAN_CMD:
            if payload == "AUTO":
                self._fan_mode = "automatic"
            else:
                self._fan_mode = "manual"
        elif topic == self.BUZZER_CMD:
            if payload == "AUTO":
                self._buzzer_mode = "automatic"
            else:
                self._buzzer_mode = "manual"

        result = self._client.publish(topic, payload, qos=1)
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            logger.info("MQTT publish → [%s]: %s", topic, payload)
        else:
            logger.error("MQTT publish failed → [%s]: %s  rc=%d",
                         topic, payload, result.rc)

    def get_latest_state(self) -> dict:
        with self._lock:
            return dict(self._latest)

    # ── Internal: connection ──────────────────────────────────────────────────

    def _connect(self):
        try:
            self._client.connect(self.broker, self.port, keepalive=60)
        except Exception as exc:
            logger.warning("MQTT initial connect failed: %s — will retry", exc)

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("MQTT connected to %s:%d", self.broker, self.port)
            with self._lock:
                self._latest["connected"] = True
            client.subscribe(self.SENSOR_TOPIC, qos=1)
            logger.info("Subscribed to %s", self.SENSOR_TOPIC)
        else:
            logger.error("MQTT connect refused (rc=%d) — retrying in %ds",
                         rc, RECONNECT_DELAY)
            time.sleep(RECONNECT_DELAY)
            self._connect()

    def _on_disconnect(self, client, userdata, rc):
        with self._lock:
            self._latest["connected"] = False
        if rc != 0:
            logger.warning("MQTT unexpected disconnect (rc=%d) — paho will auto-reconnect", rc)

    # ── Internal: message processing ─────────────────────────────────────────

    def _on_message(self, client, userdata, msg):
        """Called by the paho loop thread for every inbound message."""
        try:
            raw = msg.payload.decode("utf-8", errors="ignore").strip()
            data = json.loads(raw)
        except Exception as exc:
            logger.warning("Unparseable MQTT message: %r — %s", msg.payload, exc)
            return

        self._process(data)

    def _process(self, data: dict):
        """Validate, persist, and cache one sensor reading."""
        try:
            temp      = float(data["temp"])
            hum       = float(data["hum"])
            uv_float  = float(data["uv"])
            fan_on    = bool(data.get("fan", 0))
            buzzer_on = bool(data.get("buzzer", 0))
        except (KeyError, ValueError) as exc:
            logger.warning("Incomplete sensor payload: %s — %s", data, exc)
            return

        ts = datetime.now(timezone.utc).isoformat()

        # Compute UV index from float already provided by ESP32
        uv_index = round(uv_float, 2)

        # Update in-memory latest state
        with self._lock:
            self._latest.update({
                "temperature":  temp,
                "humidity":     hum,
                "uv_index":     uv_index,
                "fan":          fan_on,
                "buzzer":       buzzer_on,
                "fan_auto":     bool(data.get("fan_auto", 1)),
                "buzzer_auto":  bool(data.get("buzzer_auto", 1)),
                "last_updated": ts,
            })

        # ── Persist sensor readings ──────────────────────────────────────────
        try:
            temp_doc = create_temperature_reading(temp, hum)
            self.db.temperature_readings.insert_one(temp_doc)

            # Re-use raw ADC value if provided, else derive from uv float
            uv_raw = data.get("uv_raw")
            if uv_raw is None:
                # Back-calculate a synthetic raw value for schema compatibility
                uv_raw = int(round((uv_float * 100.0 / 3300.0) * 4095.0))
            uv_doc = create_uv_reading(int(uv_raw))
            self.db.uv_readings.insert_one(uv_doc)
        except Exception as exc:
            logger.error("DB insert (readings) error: %s", exc)

        # ── Persist actuator logs only on state change ───────────────────────
        fan_state_str    = "on" if fan_on    else "off"
        buzzer_state_str = "on" if buzzer_on else "off"

        try:
            if fan_state_str != self._prev_fan_state:
                fan_doc = create_fan_log(state=fan_state_str, mode=self._fan_mode)
                self.db.fan_logs.insert_one(fan_doc)
                self._prev_fan_state = fan_state_str
                logger.info("Fan log saved: %s (%s)", fan_state_str, self._fan_mode)

            if buzzer_state_str != self._prev_buzzer_state:
                buzzer_doc = create_buzzer_log(state=buzzer_state_str,
                                               mode=self._buzzer_mode)
                self.db.buzzer_logs.insert_one(buzzer_doc)
                self._prev_buzzer_state = buzzer_state_str
                logger.info("Buzzer log saved: %s (%s)",
                            buzzer_state_str, self._buzzer_mode)
        except Exception as exc:
            logger.error("DB insert (actuator log) error: %s", exc)
