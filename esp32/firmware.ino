/**
 * ============================================================================
 * IoT Monitoring Suhu & Kelembaban - Firmware ESP32 / ESP32-S3
 * File: /esp32/firmware.ino
 * ============================================================================
 * KHUSUS ESP32-S3 (PENTING DI ARDUINO IDE):
 *   1. Menu Tools -> USB CDC On Boot : "Enabled" (Wajib agar Serial muncul di
 * USB)
 *   2. Menu Tools -> PSRAM           : "Disabled"
 *   3. Menu Tools -> Upload Mode     : "UART0 / Hardware CDC"
 * ============================================================================
 */

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

// ============================================================================
// 1. PENGATURAN WIFI & GOOGLE APPS SCRIPT (EDIT DI SINI)
// ============================================================================
const char *WIFI_SSID = "BB41";
const char *WIFI_PASSWORD = "Devin1985";

// Masukkan URL Google Apps Script Web App Deployment Anda (akhiran /exec)
const char *GAS_WEB_APP_URL = "https://script.google.com/macros/s/"
                              "AKfycbxJgJMG8B3yveCjTUsgq3S3oJxkyumnpwLBw_"
                              "y5R9u9HqgkBupTwG3Cum-PJPJVfvAK/exec";

// Identitas Perangkat & Interval Pengiriman (Dinamis dari Cloud)
const char *DEVICE_ID = "ROOM_Server01";
// Interval ini DINAMIS: otomatis diperbarui dari Web Dashboard via Google Apps
// Script
unsigned long sendIntervalMs = 10000; // Default 10 detik awal (10000 ms)

// ============================================================================
// 2. MODE UJI COBA SENSOR (SANGAT COCOK UNTUK TES AWAL)
// ============================================================================
// Set true  : Untuk tes WiFi & kirim data simulasi (TANPA perlu pasang sensor
// DHT) Set false : Menggunakan sensor fisik DHT22 / DHT11 / SHT31
#define USE_DUMMY_DATA false

#define SENSOR_TYPE_DHT     1
#define SENSOR_TYPE_DHT22   1
#define SENSOR_TYPE_DHT11   1
#define SENSOR_TYPE_SHT31   2
#define ACTIVE_SENSOR       SENSOR_TYPE_DHT

// Pin Hardware
#define DHT_PIN 4 // GPIO 4 (Kabel Data OUT sensor DHT)
#define DHT_TYPE DHT11 // DHT11 (Warna Biru) atau DHT22 (Warna Putih)
#define LED_PIN 2 // GPIO 2 Status Indicator

// Setup Objek Sensor (Hanya di-load jika bukan mode dummy)
#if !USE_DUMMY_DATA
#if ACTIVE_SENSOR == SENSOR_TYPE_DHT22
#include "DHT.h"
DHT dht(DHT_PIN, DHT_TYPE);
#elif ACTIVE_SENSOR == SENSOR_TYPE_SHT31
#include "Adafruit_SHT31.h"
#include <Wire.h>
Adafruit_SHT31 sht31 = Adafruit_SHT31();
#endif
#endif

// ============================================================================
// 3. KONFIGURASI NTP (GMT+7 WIB)
// ============================================================================
const char *NTP_SERVER_1 = "pool.ntp.org";
const char *NTP_SERVER_2 = "time.google.com";
const long GMT_OFFSET_SEC = 7 * 3600; // GMT+7 = 25200 detik
const int DAYLIGHT_OFFSET = 0;

// ============================================================================
// 4. VARIABEL GLOBAL & TIMER NON-BLOCKING
// ============================================================================
unsigned long lastSendMillis = 0;
unsigned long lastReconnectAttempt = 0;
const unsigned long RECONNECT_INTERVAL_MS = 5000;

// ============================================================================
// 5. HELPER: LED INDIKATOR
// ============================================================================
void setLedState(bool on) { digitalWrite(LED_PIN, on ? HIGH : LOW); }

void signalSuccess() {
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(60);
    digitalWrite(LED_PIN, LOW);
    delay(60);
  }
}

void signalError() {
  for (int i = 0; i < 4; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(80);
    digitalWrite(LED_PIN, LOW);
    delay(80);
  }
}

// ============================================================================
// 6. HELPER: NTP TIME STRING
// ============================================================================
String getLocalTimeString() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "NTP_SYNC_PENDING";
  }
  char timeStringBuff[30];
  strftime(timeStringBuff, sizeof(timeStringBuff), "%Y-%m-%d %H:%M:%S",
           &timeinfo);
  return String(timeStringBuff);
}

// ============================================================================
// 7. HELPER: PEMBACAAN DATA SENSOR (MENDUKUNG MODE DUMMY)
// ============================================================================
bool readSensorData(float &temperature, float &humidity) {
#if USE_DUMMY_DATA
  // MODE UJI COBA: Hasilkan data simulasi suhu 26-29 °C & kelembaban 55-65 %
  static float dummyTemp = 27.5;
  static float dummyHum = 60.0;

  dummyTemp += ((float)random(-4, 5)) / 10.0;
  dummyHum += ((float)random(-8, 9)) / 10.0;

  // Batasi rentang realistis
  if (dummyTemp < 24.0)
    dummyTemp = 24.5;
  if (dummyTemp > 32.0)
    dummyTemp = 31.5;
  if (dummyHum < 45.0)
    dummyHum = 48.0;
  if (dummyHum > 75.0)
    dummyHum = 72.0;

  temperature = dummyTemp;
  humidity = dummyHum;

  Serial.println(F("[SENSOR INFO] Mode Dummy Aktif: Menggunakan data simulasi "
                   "(Sensor fisik dilewati)."));
  return true;

#else
// MODE SENSOR FISIK
#if ACTIVE_SENSOR == SENSOR_TYPE_DHT22
  humidity = dht.readHumidity();
  temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println(F("[SENSOR ERROR] Gagal membaca data dari sensor DHT22! "
                     "Periksa kabel pin GPIO 4."));
    return false;
  }
  return true;

#elif ACTIVE_SENSOR == SENSOR_TYPE_SHT31
  temperature = sht31.readTemperature();
  humidity = sht31.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println(F("[SENSOR ERROR] Gagal membaca data dari sensor SHT31!"));
    return false;
  }
  return true;
#endif
#endif
}

// ============================================================================
// 8. KONEKSI & REKONEKSI WIFI
// ============================================================================
void checkWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long currentMillis = millis();
  if (currentMillis - lastReconnectAttempt >= RECONNECT_INTERVAL_MS) {
    lastReconnectAttempt = currentMillis;
    Serial.printf("[WIFI] Koneksi terputus! Reconnecting ke '%s'...\n",
                  WIFI_SSID);
    setLedState(HIGH);
    WiFi.disconnect();
    WiFi.reconnect();
  }
}

void connectToWiFiOnBoot() {
  Serial.println(F("=================================================="));
  Serial.printf("[WIFI] Menghubungkan ke SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("\n[WIFI] TERHUBUNG DENGAN SUKSES!"));
    Serial.printf("[WIFI] IP Address  : %s\n",
                  WiFi.localIP().toString().c_str());
    Serial.printf("[WIFI] Signal RSSI : %d dBm\n", WiFi.RSSI());
    setLedState(LOW);
  } else {
    Serial.println(F("\n[WIFI ERROR] Belum terhubung! Sistem akan mencoba "
                     "rekoneksi otomatis di background."));
    setLedState(HIGH);
  }
  Serial.println(F("=================================================="));
}

// ============================================================================
// 9. PENGIRIMAN DATA TELEMETRI KE GOOGLE APPS SCRIPT
// ============================================================================
void sendTelemetryData(float temperature, float humidity) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(
        F("[HTTP ABORT] WiFi belum terhubung. Pengiriman dibatalkan."));
    signalError();
    return;
  }

  Serial.println(F("--------------------------------------------------"));
  Serial.printf("[SEND] Waktu (WIB) : %s\n", getLocalTimeString().c_str());
  Serial.printf("[SEND] Device ID   : %s\n", DEVICE_ID);
  Serial.printf("[SEND] Suhu        : %.2f °C\n", temperature);
  Serial.printf("[SEND] Kelembaban  : %.2f %%RH\n", humidity);

  // Buat JSON native tanpa dependensi ArduinoJson
  String jsonPayload = "{\"device_id\":\"" + String(DEVICE_ID) +
                       "\","
                       "\"temperature\":" +
                       String(temperature, 2) +
                       ","
                       "\"humidity\":" +
                       String(humidity, 2) + "}";

  Serial.printf("[SEND] Payload JSON: %s\n", jsonPayload.c_str());

  // Format URL request telemetri (GET method menjamin respon 200 OK & bebas redirect error 400 dari Google)
  String targetUrl = String(GAS_WEB_APP_URL);
  if (targetUrl.indexOf('?') == -1) {
    targetUrl += "?action=log";
  } else {
    targetUrl += "&action=log";
  }
  targetUrl += "&device_id=" + String(DEVICE_ID);
  targetUrl += "&temperature=" + String(temperature, 2);
  targetUrl += "&humidity=" + String(humidity, 2);
  targetUrl.replace(" ", "%20");

  WiFiClientSecure client;
  client.setInsecure(); // Bypass CA check untuk Google SSL

  HTTPClient http;
  http.begin(client, targetUrl);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.setTimeout(15000);

  unsigned long startTime = millis();
  int httpResponseCode = http.GET();
  unsigned long duration = millis() - startTime;

  if (httpResponseCode > 0) {
    Serial.printf("[HTTP] Status Code : %d (Durasi: %lu ms)\n",
                  httpResponseCode, duration);
    String responseBody = http.getString();
    Serial.printf("[HTTP] Server Body : %s\n", responseBody.c_str());

    if (httpResponseCode == 200 || httpResponseCode == 302) {
      Serial.println(F("[HTTP] Data BERHASIL disimpan ke Google Spreadsheet!"));
      signalSuccess();

      // =======================================================================
      // TWO-WAY DYNAMIC CONFIG: BACA UPDATE INTERVAL DARI CLOUD / WEB DASHBOARD
      // =======================================================================
      int cfgIdx = responseBody.indexOf("\"send_interval_sec\":");
      if (cfgIdx != -1) {
        int valStart = cfgIdx + 20;
        while (
            valStart < responseBody.length() &&
            (responseBody[valStart] == ' ' || responseBody[valStart] == ':')) {
          valStart++;
        }
        int valEnd = valStart;
        while (valEnd < responseBody.length() &&
               isDigit(responseBody[valEnd])) {
          valEnd++;
        }
        int cloudSec = responseBody.substring(valStart, valEnd).toInt();
        if (cloudSec >= 3 && cloudSec <= 3600) {
          unsigned long targetMs = (unsigned long)cloudSec * 1000;
          if (targetMs != sendIntervalMs) {
            sendIntervalMs = targetMs;
            Serial.println(
                F("\n**************************************************"));
            Serial.println(
                F(">>> [CLOUD REMOTE CONFIG] Interval Diperbarui dari Web!"));
            Serial.printf(">>> Interval Baru ESP32: %d Detik (%lu ms)\n",
                          cloudSec, sendIntervalMs);
            Serial.println(
                F("**************************************************\n"));
          }
        }
      }
    } else {
      Serial.printf("[HTTP WARNING] Respon tidak biasa dari server: %d\n",
                    httpResponseCode);
      signalError();
    }
  } else {
    Serial.printf("[HTTP ERROR] Request gagal! Kode error: %d, Deskripsi: %s\n",
                  httpResponseCode,
                  http.errorToString(httpResponseCode).c_str());
    signalError();
  }

  http.end();
  Serial.println(F("--------------------------------------------------"));
}

// ============================================================================
// 10. SETUP & LOOP
// ============================================================================
void setup() {
  Serial.begin(115200);

  // Buffer delay agar Serial Monitor di laptop sempat tersambung ke port USB
  // CDC ESP32-S3
  delay(2000);

  pinMode(LED_PIN, OUTPUT);
  setLedState(LOW);

  // Tampilkan Banner Booting berulang agar pasti tertangkap di Serial Monitor
  for (int i = 0; i < 2; i++) {
    Serial.println(F("\n"));
  }
  Serial.println(F("=================================================="));
  Serial.println(F("   ESP32-S3 IoT Telemetry - UJI KONEKSI WIFI      "));
  Serial.printf("   SSID Target : %s\n", WIFI_SSID);
  Serial.printf("   Device ID   : %s\n", DEVICE_ID);
#if USE_DUMMY_DATA
  Serial.println(F("   Status Mode : [DUMMY TEST MODE - Tanpa Sensor DHT]"));
#else
  Serial.println(F("   Status Mode : [SENSOR FISIK DHT AKTIF]"));
#endif
  Serial.println(F("=================================================="));

#if !USE_DUMMY_DATA
#if ACTIVE_SENSOR == SENSOR_TYPE_DHT22
  Serial.println(F("[INIT] Memulai sensor fisik DHT22 di GPIO 4..."));
  dht.begin();
#elif ACTIVE_SENSOR == SENSOR_TYPE_SHT31
  Serial.println(F("[INIT] Memulai sensor fisik SHT31..."));
  Wire.begin();
  sht31.begin(0x44);
#endif
#endif

  // Hubungkan ke WiFi
  connectToWiFiOnBoot();

  // Sinkronisasi Waktu NTP
  Serial.println(F("[NTP] Memulai sinkronisasi waktu pool.ntp.org (GMT+7)..."));
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET, NTP_SERVER_1, NTP_SERVER_2);

  int ntpRetry = 0;
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo) && ntpRetry < 6) {
    delay(500);
    ntpRetry++;
  }
  Serial.printf("[NTP] Waktu sekarang: %s\n", getLocalTimeString().c_str());

  Serial.println(F(
      "[SYSTEM] Inisialisasi siap. Memulai siklus kirim data telemetri...\n"));
}

void loop() {
  // Cek WiFi di background
  checkWiFiConnection();

  // Pengiriman berkala non-blocking sesuai interval dinamis dari Cloud
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendMillis >= sendIntervalMs) {
    lastSendMillis = currentMillis;

    float temperature = 0.0;
    float humidity = 0.0;

    if (readSensorData(temperature, humidity)) {
      sendTelemetryData(temperature, humidity);
    }
  }
}
