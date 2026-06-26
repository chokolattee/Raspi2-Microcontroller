import threading
import logging
import time
from datetime import datetime, timezone

import serial

from models.temperature_reading import create_temperature_reading
from models.uv_reading           import create_uv_reading
from models.fan_log              import create_fan_log
from models.buzzer_log           import create_buzzer_log

logger = logging.getLogger("calungsod.serial")

RETRY_INTERVAL = 5


class SerialReader:
    """Background thread that reads from the ESP32 serial port."""

    def __init__(self, port: str, baud_rate: int, db):
        self.port      = port
        self.baud_rate = baud_rate
        self.db        = db
        self._ser      = None          # serial.Serial instance
        self._lock     = threading.Lock()
        self._stop     = threading.Event()
        self._thread   = threading.Thread(target=self._run, daemon=True)

        # Latest parsed state (thread-safe via lock)
        self._latest = {
            "connected": False,
            "temperature": None,
            "humidity":    None,
            "uv_raw":      None,
            "uv_index":    None,
            "buzzer":      False,
            "fan":         False,
            "last_updated": None,
        }

        # Track previous actuator states to avoid duplicate DB writes
        self._prev_fan_state    = None
        self._prev_buzzer_state = None
        self._fan_mode          = "automatic"
        self._buzzer_mode       = "automatic"

    # Public Interface

    def start(self):
        """Start the background reader thread."""
        self._thread.start()
        logger.info("Serial reader thread started (port=%s, baud=%d)", self.port, self.baud_rate)

    def stop(self):
        """Signal the thread to stop."""
        self._stop.set()

    def send_command(self, cmd: str):
        # Update mode tracking
        if "FAN:AUTO" in cmd:
            self._fan_mode = "automatic"
        elif cmd.startswith("FAN:"):
            self._fan_mode = "manual"

        if "BUZZER:AUTO" in cmd:
            self._buzzer_mode = "automatic"
        elif cmd.startswith("BUZZER:"):
            self._buzzer_mode = "manual"

        with self._lock:
            if self._ser and self._ser.is_open:
                try:
                    self._ser.write((cmd + "\n").encode("utf-8"))
                    logger.info("Serial command sent: %s", cmd)
                except Exception as e:
                    logger.error("Failed to send command '%s': %s", cmd, e)
            else:
                logger.warning("Serial port not open — command '%s' discarded", cmd)

    def get_latest_state(self) -> dict:
        with self._lock:
            return dict(self._latest)

    # Internal
    def _run(self):
        while not self._stop.is_set():
            try:
                self._open_serial()
                self._read_loop()
            except Exception as e:
                logger.error("Serial error: %s — retrying in %ds", e, RETRY_INTERVAL)
                self._close_serial()
                time.sleep(RETRY_INTERVAL)

    def _open_serial(self):
        with self._lock:
            self._ser = serial.Serial(
                port=self.port,
                baudrate=self.baud_rate,
                timeout=2,
            )
        with self._lock:
            self._latest["connected"] = True
        logger.info("Serial port opened: %s", self.port)

    def _close_serial(self):
        with self._lock:
            if self._ser:
                try:
                    self._ser.close()
                except Exception:
                    pass
                self._ser = None
            self._latest["connected"] = False

    def _read_loop(self):
        while not self._stop.is_set():
            try:
                line = self._ser.readline().decode("utf-8", errors="ignore").strip()
            except Exception as e:
                logger.error("Read error: %s", e)
                raise

            if not line:
                continue

            parsed = self._parse_line(line)
            if parsed is None:
                logger.debug("Unparseable line: %r", line)
                continue

            self._process(parsed)

    def _parse_line(self, line: str) -> dict | None:
        """
        Parse a line in the format:
        UV:<raw>,TEMP:<c>,HUM:<%>,BUZZER:<0|1>,FAN:<0|1>
        """
        try:
            parts = {}
            for token in line.split(","):
                key, _, val = token.partition(":")
                parts[key.strip().upper()] = val.strip()

            return {
                "uv_raw":      int(parts["UV"]),
                "temperature": float(parts["TEMP"]),
                "humidity":    float(parts["HUM"]),
                "buzzer":      parts["BUZZER"] == "1",
                "fan":         parts["FAN"] == "1",
            }
        except Exception:
            return None

    def _process(self, data: dict):
        """Save parsed data to MongoDB and update the in-memory state."""
        ts = datetime.now(timezone.utc).isoformat()

        # --- Compute UV index ---
        from models.uv_reading import raw_to_uv_index
        uv_index = raw_to_uv_index(data["uv_raw"])

        # --- Update latest state ---
        with self._lock:
            self._latest.update({
                "temperature": data["temperature"],
                "humidity":    data["humidity"],
                "uv_raw":      data["uv_raw"],
                "uv_index":    uv_index,
                "buzzer":      data["buzzer"],
                "fan":         data["fan"],
                "last_updated": ts,
            })

        # --- Persist sensor readings to MongoDB ---
        try:
            temp_doc = create_temperature_reading(data["temperature"], data["humidity"])
            self.db.temperature_readings.insert_one(temp_doc)

            uv_doc = create_uv_reading(data["uv_raw"])
            self.db.uv_readings.insert_one(uv_doc)
        except Exception as e:
            logger.error("DB insert (readings) error: %s", e)

        # --- Persist actuator logs only when state changes ---
        fan_state_str    = "on" if data["fan"]    else "off"
        buzzer_state_str = "on" if data["buzzer"] else "off"

        try:
            if fan_state_str != self._prev_fan_state:
                fan_doc = create_fan_log(state=fan_state_str, mode=self._fan_mode)
                self.db.fan_logs.insert_one(fan_doc)
                self._prev_fan_state = fan_state_str

            if buzzer_state_str != self._prev_buzzer_state:
                buzzer_doc = create_buzzer_log(state=buzzer_state_str, mode=self._buzzer_mode)
                self.db.buzzer_logs.insert_one(buzzer_doc)
                self._prev_buzzer_state = buzzer_state_str
        except Exception as e:
            logger.error("DB insert (actuator log) error: %s", e)
