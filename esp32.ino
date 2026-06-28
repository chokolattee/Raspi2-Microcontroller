#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

#define DHT_PIN     4
#define DHT_TYPE    DHT11
#define UV_PIN      34
#define RELAY_PIN   19
#define BUZZER_PIN  18

const char* ssid        = "<wifi name>";
const char* password    = "<wifi password>";
const char* mqtt_server = "<raspi ip address>";

const char* TOPIC_SENSORS    = "esp32/sensors";
const char* TOPIC_FAN_CMD    = "esp32/fan/cmd";
const char* TOPIC_BUZZER_CMD = "esp32/buzzer/cmd";

const float TEMP_THRESHOLD = 30.0;
const int   UV_THRESHOLD   = 6.0;

bool fanAuto    = true;
bool buzzerAuto = true;
bool fanOn      = false;
bool buzzerOn   = false;

WiFiClient   espClient;
PubSubClient client(espClient);
DHT          dht(DHT_PIN, DHT_TYPE);

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[32] = {0};
  for (unsigned int i = 0; i < length && i < sizeof(msg) - 1; i++) {
    msg[i] = (char)payload[i];
  }

  String t = String(topic);
  String m = String(msg);

  if (t == TOPIC_FAN_CMD) {
    if (m == "AUTO") {
      fanAuto = true;
    } else if (m == "ON") {
      fanAuto = false;
      fanOn   = true;
      digitalWrite(RELAY_PIN, LOW);
    } else if (m == "OFF") {
      fanAuto = false;
      fanOn   = false;
      digitalWrite(RELAY_PIN, HIGH);
    }
  } else if (t == TOPIC_BUZZER_CMD) {
    if (m == "AUTO") {
      buzzerAuto = true;
    } else if (m == "ON") {
      buzzerAuto = false;
      buzzerOn   = true;
      digitalWrite(BUZZER_PIN, HIGH);
    } else if (m == "OFF") {
      buzzerAuto = false;
      buzzerOn   = false;
      digitalWrite(BUZZER_PIN, LOW);
    }
  }
}

void connectMQTT() {
  while (!client.connected()) {
    if (client.connect("ESP32Client")) {
      client.subscribe(TOPIC_FAN_CMD);
      client.subscribe(TOPIC_BUZZER_CMD);
    } else {
      delay(2000);
    }
  }
}

float rawToUV(int raw) {
  return ((raw * 3300.0) / 4095.0) / 100.0;
}

void setup() {
  Serial.begin(115200);

  pinMode(RELAY_PIN,  OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(RELAY_PIN,  HIGH);
  digitalWrite(BUZZER_PIN, LOW);

  analogReadResolution(12);
  analogSetPinAttenuation(UV_PIN, ADC_11db);

  dht.begin();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(mqtt_server, 1883);
  client.setCallback(mqttCallback);
}

unsigned long lastPublish = 0;
const unsigned long PUBLISH_INTERVAL = 5000;

void loop() {
  if (!client.connected()) connectMQTT();
  client.loop();

  unsigned long now = millis();
  if (now - lastPublish < PUBLISH_INTERVAL) return;
  lastPublish = now;

  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  if (isnan(temp) || isnan(hum)) return;

  int   uvRaw   = analogRead(UV_PIN);
  float uvIndex = rawToUV(uvRaw);

  if (fanAuto) {
    fanOn = (temp >= TEMP_THRESHOLD);
    digitalWrite(RELAY_PIN, fanOn ? LOW : HIGH);
  }

  if (buzzerAuto) {
    buzzerOn = (uvIndex >= UV_THRESHOLD);
    digitalWrite(BUZZER_PIN, buzzerOn ? HIGH : LOW);
  }

  char payload[128];
  snprintf(payload, sizeof(payload),
    "{\"uv\":%.2f,\"temp\":%.1f,\"hum\":%.1f,\"fan\":%d,\"buzzer\":%d,"
    "\"fan_auto\":%d,\"buzzer_auto\":%d}",
    uvIndex, temp, hum,
    fanOn      ? 1 : 0,
    buzzerOn   ? 1 : 0,
    fanAuto    ? 1 : 0,
    buzzerAuto ? 1 : 0);

  client.publish(TOPIC_SENSORS, payload);
  Serial.println(payload);
}