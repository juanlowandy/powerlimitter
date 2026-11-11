/*
 * Smart Power Limiter - firmware ESP32 DOIT DevKit V1 (1 tenant, 2 colokan)
 *
 * Rangkaian (opsi A: satu INA219 mengukur arus TOTAL kedua colokan):
 *   Sumber DC -> INA219 VIN+ -> VIN- -> cabang ke Relay 1 (colokan 1) dan Relay 2 (colokan 2) -> beban
 *
 * Alur:
 *  1. Baca INA219 setiap 500 ms (arus total kedua colokan).
 *  2. Kalau arus > alokasi (misalnya 2 A) selama 3 pembacaan berturut-turut, KEDUA relay
 *     langsung diputus DI ESP32 (tidak menunggu server), supaya tetap aman walau Wi-Fi mati.
 *  3. Setiap ±10 detik kirim laporan ke server:
 *       POST {SERVER_URL}/api/tenants/{DEVICE_ID}/readings
 *       body: { "voltage": V, "current": A, "outlet1": "ON"/"OFF", "outlet2": "ON"/"OFF",
 *               "tripped": bool, "tripCurrent": A }
 *  4. Balasan server (201) berisi perintah tiap colokan dan alokasi terbaru:
 *       { "command": { "outlet1": "ON", "outlet2": "OFF", "limitA": 2, "intervalMs": 10000 } }
 *     Colokan 2 hanya menyala kalau admin mengizinkan lewat website.
 *
 * Library (Arduino IDE > Library Manager): Adafruit INA219, ArduinoJson (v7)
 * Board: "DOIT ESP32 DEVKIT V1"
 *
 * Wiring:
 *  INA219 SDA -> GPIO21, SCL -> GPIO22, VCC -> 3V3, GND -> GND
 *  Relay IN1 -> GPIO26 (colokan 1), IN2 -> GPIO27 (colokan 2), VCC -> VIN (5V), GND -> GND
 *  GND sumber, GND INA219, GND relay, dan GND ESP32 wajib disatukan.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ================= UBAH BAGIAN INI =================
const char* WIFI_SSID     = "NAMA_WIFI";          // harus Wi-Fi 2.4 GHz
const char* WIFI_PASSWORD = "PASSWORD_WIFI";
// Lokal (npm run dev): "http://IP-LAPTOP:3000"    Online: "https://nama-project.vercel.app"
const char* SERVER_URL    = "http://192.168.1.10:3000";
const char* DEVICE_ID     = "ESP32-001";          // harus sudah terdaftar di Kelola Tenant
const char* DEVICE_KEY    = "bazar-esp32-2026";   // sama dengan DEVICE_KEY di server

const int  OUTLET_PIN[2]    = {26, 27};           // relay colokan 1 dan colokan 2
const bool RELAY_ACTIVE_LOW = true;               // modul relay 5V umumnya active LOW
// ===================================================

const unsigned long SAMPLE_MS     = 500;
const int           TRIP_SAMPLES  = 3;
const float         DEFAULT_LIMIT = 2.0;          // A, dipakai sebelum dapat alokasi dari server

Adafruit_INA219 ina219;
Preferences prefs;
String readingsUrl;

float limitA = DEFAULT_LIMIT;
unsigned long reportMs = 10000;

bool command[2] = {true, false};   // perintah dari server (colokan 1 ON, colokan 2 OFF)
bool relayOn[2] = {false, false};  // kondisi relay sebenarnya
bool tripped = false;              // diputus karena melebihi alokasi
bool awaitingAck = false;          // sudah trip, server belum membalas OFF
int  overCount = 0;
float tripCurrent = 0;

float sumV = 0, sumA = 0;
int   sampleCount = 0;
float lastV = 0, lastA = 0;
unsigned long lastSample = 0, lastReport = 0, lastWifiTry = 0;

void setRelay(int i, bool on) {
  relayOn[i] = on;
  digitalWrite(OUTLET_PIN[i], (on ^ RELAY_ACTIVE_LOW) ? HIGH : LOW);
}

// Relay mengikuti perintah server, kecuali sedang diputus karena over-limit
void applyOutlets() {
  for (int i = 0; i < 2; i++) setRelay(i, command[i] && !tripped);
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED || millis() - lastWifiTry < 5000) return;
  lastWifiTry = millis();
  Serial.println("Menghubungkan Wi-Fi...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void sampleAndProtect() {
  float busV    = ina219.getBusVoltage_V();
  float shuntmV = ina219.getShuntVoltage_mV();
  float current = ina219.getCurrent_mA() / 1000.0;
  if (current < 0) current = 0;
  lastV = busV + shuntmV / 1000.0;
  lastA = current;
  sumV += lastV; sumA += lastA; sampleCount++;

  bool anyOn = relayOn[0] || relayOn[1];
  if (anyOn && current > limitA) overCount++;
  else overCount = 0;

  if (overCount >= TRIP_SAMPLES && !tripped) {
    tripped = true;
    awaitingAck = true;
    tripCurrent = current;
    applyOutlets();                       // kedua relay diputus
    Serial.printf("!! OVER-LIMIT %.2f A > %.2f A, kedua colokan diputus\n", current, limitA);
  }
}

void saveCommands() {
  prefs.putBool("out1", command[0]);
  prefs.putBool("out2", command[1]);
}

void handleCommand(JsonObject cmd) {
  float newLimit = cmd["limitA"] | limitA;
  if (newLimit > 0 && newLimit != limitA) {
    limitA = newLimit;
    prefs.putFloat("limitA", limitA);     // tetap tersimpan walau ESP32 restart
    Serial.printf("Alokasi baru: %.2f A\n", limitA);
  }
  reportMs = cmd["intervalMs"] | reportMs;

  bool c1 = strcmp(cmd["outlet1"] | "ON", "ON") == 0;
  bool c2 = strcmp(cmd["outlet2"] | "OFF", "ON") == 0;

  if (tripped) {
    if (!c1 && !c2) {
      awaitingAck = false;                // server sudah mencatat over-limit
    } else if (!awaitingAck) {
      tripped = false;                    // admin menyambungkan ulang dari website
      overCount = 0;
      Serial.println(">> Disambungkan ulang oleh pengelola");
    }
  }

  if (c1 != command[0] || c2 != command[1]) {
    command[0] = c1;
    command[1] = c2;
    saveCommands();
    Serial.printf("Perintah baru: colokan 1 %s, colokan 2 %s\n", c1 ? "ON" : "OFF", c2 ? "ON" : "OFF");
  }
  applyOutlets();
}

void report() {
  float v = sampleCount ? sumV / sampleCount : lastV;
  float a = sampleCount ? sumA / sampleCount : lastA;
  sumV = sumA = 0; sampleCount = 0;

  Serial.printf("%.2f V  %.3f A  alokasi=%.2f A  colokan1=%s colokan2=%s  %s\n",
                v, a, limitA, relayOn[0] ? "ON" : "OFF", relayOn[1] ? "ON" : "OFF",
                tripped ? "OVER-LIMIT" : "normal");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("   -> Wi-Fi belum terhubung, data tidak dikirim (proteksi tetap aktif)");
    return;
  }

  JsonDocument doc;
  doc["voltage"] = v;
  doc["current"] = a;
  doc["outlet1"] = relayOn[0] ? "ON" : "OFF";
  doc["outlet2"] = relayOn[1] ? "ON" : "OFF";
  doc["tripped"] = tripped;
  if (tripped) doc["tripCurrent"] = tripCurrent;
  String body;
  serializeJson(doc, body);

  WiFiClientSecure secureClient;
  WiFiClient plainClient;
  HTTPClient http;
  if (readingsUrl.startsWith("https")) {
    secureClient.setInsecure();           // tanpa verifikasi sertifikat (cukup untuk tugas)
    http.begin(secureClient, readingsUrl);
  } else {
    http.begin(plainClient, readingsUrl);
  }
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  int code = http.POST(body);
  String response = http.getString();
  if (code == 201) {
    Serial.println("   -> tersimpan di database (201)");
    JsonDocument res;
    if (!deserializeJson(res, response)) handleCommand(res["command"].as<JsonObject>());
  } else if (code == 401) {
    Serial.println("   -> 401: DEVICE_KEY tidak sama dengan di server");
  } else if (code == 404) {
    Serial.println("   -> 404: DEVICE_ID belum terdaftar di Kelola Tenant");
  } else if (code < 0) {
    Serial.printf("   -> gagal terhubung (%s). Cek SERVER_URL & firewall\n", http.errorToString(code).c_str());
  } else {
    Serial.printf("   -> HTTP %d %s\n", code, response.c_str());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);

  for (int i = 0; i < 2; i++) {
    pinMode(OUTLET_PIN[i], OUTPUT);
    setRelay(i, false);                   // mulai dalam keadaan mati
  }

  prefs.begin("smartpower", false);
  limitA = prefs.getFloat("limitA", DEFAULT_LIMIT);
  command[0] = prefs.getBool("out1", true);
  command[1] = prefs.getBool("out2", false);

  Wire.begin(21, 22);
  if (!ina219.begin()) {
    Serial.println("INA219 tidak ditemukan! Cek VCC, GND, SDA (D21), SCL (D22). Colokan tetap mati.");
    while (true) delay(1000);
  }
  // Kalibrasi default Adafruit (32V, 2A): membaca sampai ±3,2 A dengan shunt 0,1 ohm.
  // Jangan pakai setCalibration_32V_1A(): arus di atas ±1,3 A tidak akan terbaca.

  applyOutlets();                         // pulihkan perintah terakhir yang tersimpan

  readingsUrl = String(SERVER_URL) + "/api/tenants/" + DEVICE_ID + "/readings";
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiTry = millis();
  Serial.printf("Smart Power %s -> %s (alokasi %.2f A)\n", DEVICE_ID, readingsUrl.c_str(), limitA);
}

void loop() {
  connectWifi();
  unsigned long now = millis();
  if (now - lastSample >= SAMPLE_MS) {
    lastSample = now;
    sampleAndProtect();
  }
  if (now - lastReport >= reportMs) {
    lastReport = now;
    report();
  }
}
