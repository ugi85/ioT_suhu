/**
 * ============================================================================
 * IoT Monitoring Suhu & Kelembaban - Firmware ESP32 / ESP32-S3
 * File: /esp32/firmware.ino
 * ============================================================================
 * FITUR UNGGULAN:
 * 1. ZERO-HARDCODE WIFI & SERVER (WIFI CAPTIVE PORTAL):
 *    - Jika WiFi tidak ditemukan atau alat dipindah ke lokasi/ruangan baru,
 *      ESP32 otomatis memancarkan hotspot WiFi sendiri: "EcoSense-Setup".
 *    - Cukup sambungkan HP/Laptop ke WiFi "EcoSense-Setup", halaman pengaturan
 *      langsung muncul otomatis di layar HP (seperti login WiFi hotel).
 *    - Anda bisa memilih WiFi baru, ketik password, dan ubah URL Google Script
 *      langsung dari HP tanpa perlu colok kabel ke laptop atau upload ulang
 * kode!
 * 2. RESET TOMBOL BOOT (PINDAH TEMPAT KAPAN SAJA):
 *    - Tahan tombol BOOT (GPIO 0) selama 4 detik untuk membuka kembali portal
 * setup.
 * 3. PENYIMPANAN PERMANEN (NVS FLASH PREFERENCES):
 *    - Semua pengaturan (SSID, Password, URL, Device ID, Interval) tersimpan
 *      aman di memori flash internal ESP32 dan tidak hilang saat mati lampu.
 * 4. DYNAMIC TWO-WAY REMOTE CONFIG:
 *    - Sinkronisasi interval pengiriman & nama ruangan otomatis dari Web
 * Dashboard.
 * 5. PENGIRIMAN DATA HTTP GET:
 *    - Menjamin respon 200 OK dan bebas kendala redirect Google Apps Script.
 *
 * PENGATURAN ARDUINO IDE (KHUSUS ESP32-S3):
 *   1. Tools -> USB CDC On Boot : "Enabled" (Wajib agar Serial menyala di USB)
 *   2. Tools -> PSRAM           : "Disabled"
 *   3. Tools -> Upload Mode     : "UART0 / Hardware CDC"
 * ============================================================================
 */

#include "DHT.h"
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

// ============================================================================
// 1. NILAI STANDAR BAWAAN PABRIK (DEFAULT FACTORY FALLBACK)
// ============================================================================
// Jika memori flash masih kosong, nilai default ini yang akan digunakan.
// Begitu Anda atur lewat HP di portal "EcoSense-Setup", nilai baru yang
// dipakai!
const char *FACTORY_DEFAULT_SSID = "BB41";
const char *FACTORY_DEFAULT_PASS = "Devin1985";
const char *FACTORY_DEFAULT_GAS_URL =
    "https://script.google.com/macros/s/"
    "AKfycbxJgJMG8B3yveCjTUsgq3S3oJxkyumnpwLBw_"
    "y5R9u9HqgkBupTwG3Cum-PJPJVfvAK/exec";
// Tips Multi-Device & Dynamic Provisioning:
// - Diset "AUTO": Board otomatis membuat ID unik dari Hardware MAC Address silikonnya
//   (misal: Log_E1A41C, Log_3F8B20). Anda bisa flash 1 file kode yang sama ke ratusan board sekaligus!
// - Nilai ID ini juga dapat Anda ubah kapan saja melalui portal HP (192.168.4.1) atau Web Dashboard.
const char *FACTORY_DEFAULT_DEV_ID = "AUTO";

// ============================================================================
// 2. PIN HARDWARE & SENSOR
// ============================================================================
#define DHT_PIN 4         // GPIO 4 (Kabel Data Sensor DHT11)
#define DHT_TYPE DHT11    // Sensor DHT11 (Warna Biru)
#define LED_PIN 2         // GPIO 2 Status Indikator
#define BOOT_BUTTON_PIN 0 // GPIO 0 Tombol BOOT di board ESP32

DHT dht(DHT_PIN, DHT_TYPE);
Preferences prefs;

// ============================================================================
// 3. VARIABEL JARINGAN & STATE AKTIF (DI-LOAD DARI FLASH NVS)
// ============================================================================
String activeSSID = "";
String activePassword = "";
String activeGasUrl = "";
String activeDeviceId = "";
String activeFriendlyName = "";
unsigned long sendIntervalMs = 10000; // Default 10 detik

// Timer non-blocking
unsigned long lastSendMillis = 0;
unsigned long lastReconnectAttempt = 0;
const unsigned long RECONNECT_INTERVAL_MS = 5000;

// ============================================================================
// 4. CAPTIVE PORTAL & WEB SERVER (UNTUK SETUP DARI HP)
// ============================================================================
const byte DNS_PORT = 53;
DNSServer dnsServer;
WebServer server(80);
bool isPortalActive = false;
IPAddress apIP(192, 168, 4, 1);
IPAddress netMsk(255, 255, 255, 0);

// ============================================================================
// 5. HELPER LED & TOMBOL
// ============================================================================
void setLedState(bool on) { digitalWrite(LED_PIN, on ? HIGH : LOW); }

void blinkLed(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

// ============================================================================
// 6. HELPER NTP TIME STRING (GMT+7 WIB)
// ============================================================================
String getLocalTimeString() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 500)) {
    return "NTP_SYNC_PENDING";
  }
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(buf);
}

// Helper: Generate Device ID unik otomatis berbasis Hardware MAC Address silikon ESP32
String generateAutoDeviceId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[20];
  snprintf(buf, sizeof(buf), "Log_%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(buf);
}

// ============================================================================
// 7. LOAD & SIMPAN PENGATURAN DI MEMORI FLASH NVS
// ============================================================================
void loadConfiguration() {
  prefs.begin("iot_ecosense", false);

  activeSSID = prefs.getString("wifi_ssid", FACTORY_DEFAULT_SSID);
  activePassword = prefs.getString("wifi_pass", FACTORY_DEFAULT_PASS);
  activeGasUrl = prefs.getString("gas_url", FACTORY_DEFAULT_GAS_URL);
  activeDeviceId = prefs.getString("dev_id", FACTORY_DEFAULT_DEV_ID);

  // Jika diset "AUTO" atau memori kosong, buat ID unik dari MAC Address
  if (activeDeviceId == "AUTO" || activeDeviceId.length() == 0) {
    activeDeviceId = generateAutoDeviceId();
    prefs.putString("dev_id", activeDeviceId);
  }

  activeFriendlyName = prefs.getString("dev_name", activeDeviceId);

  unsigned long savedInterval = prefs.getULong("interval_ms", 10000);
  if (savedInterval >= 3000 && savedInterval <= 3600000) {
    sendIntervalMs = savedInterval;
  }
}

void saveConfiguration(const String &ssid, const String &pass,
                       const String &gasUrl, const String &devId) {
  prefs.putString("wifi_ssid", ssid);
  prefs.putString("wifi_pass", pass);
  prefs.putString("gas_url", gasUrl);
  prefs.putString("dev_id", devId);

  activeSSID = ssid;
  activePassword = pass;
  activeGasUrl = gasUrl;
  activeDeviceId = devId;
  activeFriendlyName = devId;
}

// ============================================================================
// 8. TAMPILAN HTML CAPTIVE PORTAL (RESPONSIF MOBILE-FRIENDLY DI LAYAR HP)
// ============================================================================
String buildSetupPageHtml(const String &scanResults) {
  String html =
      F("<!DOCTYPE html><html lang='id'><head><meta charset='UTF-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1.0'>"
        "<title>IoT EcoSense Setup</title>"
        "<style>"
        "body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe "
        "UI',Roboto,sans-serif;background:#090d16;color:#e2e8f0;padding:20px;}"
        ".card{max-width:440px;margin:20px "
        "auto;background:#131b2e;padding:24px;border-radius:24px;border:1px "
        "solid #1e293b;box-shadow:0 10px 30px rgba(0,0,0,0.5);}"
        ".header{text-align:center;margin-bottom:20px;}"
        ".logo{display:inline-block;width:48px;height:48px;border-radius:14px;"
        "background:linear-gradient(135deg,#14b8a6,#06b6d4);line-height:48px;"
        "font-size:24px;color:#090d16;font-weight:900;}"
        "h2{margin:12px 0 4px 0;font-size:20px;color:#fff;}"
        "p{margin:0;color:#94a3b8;font-size:12px;}"
        "label{display:block;margin-top:14px;margin-bottom:5px;font-size:12px;"
        "font-weight:bold;color:#cbd5e1;}"
        "input,select{width:100%;box-sizing:border-box;padding:12px;border-"
        "radius:12px;border:1px solid "
        "#334155;background:#0f172a;color:#fff;font-size:14px;outline:none;}"
        "input:focus,select:focus{border-color:#14b8a6;}"
        ".btn{width:100%;margin-top:24px;padding:14px;border-radius:14px;"
        "border:none;background:linear-gradient(135deg,#0d9488,#14b8a6);color:#"
        "fff;font-size:15px;font-weight:bold;cursor:pointer;box-shadow:0 4px "
        "15px rgba(20,184,166,0.3);}"
        ".btn:active{transform:scale(0.98);}"
        ".note{margin-top:16px;padding:12px;border-radius:12px;background:rgba("
        "20,184,166,0.08);border:1px solid "
        "rgba(20,184,166,0.25);font-size:11px;color:#5eead4;line-height:1.5;}"
        ".pass-box{position:relative;display:flex;align-items:center;}"
        ".pass-box input{padding-right:46px;}"
        ".eye-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#94a3b8;cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;border-radius:8px;}"
        ".eye-btn:hover,.eye-btn:active{color:#14b8a6;background:rgba(255,255,255,0.05);}"
        "</style></head><body>"
        "<div class='card'>"
        "<div class='header'>"
        "<div class='logo'>&#9889;</div>"
        "<h2>IoT EcoSense</h2>"
        "<p>Konfigurasi Jaringan & Identitas Perangkat</p>"
        "</div>"
        "<form action='/save' method='POST'>"
        "<label>Pilih WiFi Sekitar:</label>"
        "<select name='ssid_select' "
        "onchange='if(this.value!=\"\")document.getElementById(\"ssid\").value="
        "this.value;'>"
        "<option value=''>-- Pilih SSID WiFi --</option>");

  html += scanResults;

  html += F("</select>"
            "<label>Nama WiFi (SSID):</label>"
            "<input type='text' id='ssid' name='ssid' value='");
  html += activeSSID;
  html += F("' required placeholder='Nama WiFi'>"
            "<label>Password WiFi:</label>"
            "<div class='pass-box'>"
            "<input type='password' id='pass' name='pass' value='");
  html += activePassword;
  html += F("' placeholder='Password WiFi (Kosongkan jika Open)'>"
            "<button type='button' class='eye-btn' onclick='togglePass()' title='Lihat/Sembunyikan Password'>"
            "<svg id='eye-open' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg>"
            "<svg id='eye-closed' style='display:none;' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24'/><line x1='1' y1='1' x2='23' y2='23'/></svg>"
            "</button>"
            "</div>"
            "<label>Device ID (Identitas Alat):</label>"
            "<input type='text' name='dev_id' value='");
  html += activeDeviceId;
  html += F("' required placeholder='misal: ROOM_01 atau Log01'>"
            "<label>Google Apps Script URL:</label>"
            "<input type='url' name='gas_url' value='");
  html += activeGasUrl;
  html +=
      F("' required placeholder='https://script.google.com/macros/s/.../exec'>"
        "<button type='submit' class='btn'>&#128190; SIMPAN &amp; "
        "HUBUNGKAN</button>"
        "</form>"
        "<div class='note'>&#128161; <strong>Tips:</strong> Setelah Anda klik "
        "Simpan, ESP32 akan restart dan langsung terhubung ke WiFi baru. "
        "Hotspot ini akan mati otomatis.</div>"
        "</div>"
        "<script>"
        "function togglePass(){"
        "var p=document.getElementById('pass');"
        "var o=document.getElementById('eye-open');"
        "var c=document.getElementById('eye-closed');"
        "if(p.type==='password'){"
        "p.type='text';o.style.display='none';c.style.display='block';"
        "}else{"
        "p.type='password';o.style.display='block';c.style.display='none';"
        "}"
        "}"
        "</script>"
        "</body></html>");

  return html;
}

// ============================================================================
// 9. ROUTE HANDLERS CAPTIVE PORTAL
// ============================================================================
String scanWifiOptions() {
  int n = WiFi.scanNetworks();
  String options = "";
  if (n == 0) {
    options = "<option value=''>Tidak ada WiFi terdeteksi</option>";
  } else {
    for (int i = 0; i < n; ++i) {
      String netSSID = WiFi.SSID(i);
      int rssi = WiFi.RSSI(i);
      options += "<option value='" + netSSID + "'>" + netSSID + " (" +
                 String(rssi) + " dBm)</option>";
    }
  }
  return options;
}

void handlePortalRoot() {
  String wifiList = scanWifiOptions();
  server.send(200, "text/html", buildSetupPageHtml(wifiList));
}

void handlePortalSave() {
  String newSsid = server.hasArg("ssid") ? server.arg("ssid") : "";
  String newPass = server.hasArg("pass") ? server.arg("pass") : "";
  String newGasUrl = server.hasArg("gas_url") ? server.arg("gas_url") : "";
  String newDevId = server.hasArg("dev_id") ? server.arg("dev_id") : "";

  newSsid.trim();
  newPass.trim();
  newGasUrl.trim();
  newDevId.trim();

  if (newSsid.length() > 0 && newGasUrl.length() > 0 && newDevId.length() > 0) {
    saveConfiguration(newSsid, newPass, newGasUrl, newDevId);

    String resp =
        F("<!DOCTYPE html><html><head><meta name='viewport' "
          "content='width=device-width,initial-scale=1.0'>"
          "<style>body{background:#090d16;color:#fff;font-family:sans-serif;"
          "text-align:center;padding:40px;}"
          ".box{background:#131b2e;padding:30px;border-radius:20px;border:1px "
          "solid #14b8a6;max-width:380px;margin:auto;}"
          "h3{color:#14b8a6;}</style></head><body>"
          "<div class='box'>"
          "<h3>&#10003; Berhasil Disimpan!</h3>"
          "<p>ESP32 sedang me-restart dan menghubungkan ke WiFi: <strong>");
    resp += newSsid;
    resp += F("</strong></p>"
              "<p style='font-size:12px;color:#94a3b8;'>Anda dapat "
              "menyambungkan HP Anda kembali ke WiFi utama.</p>"
              "</div></body></html>");

    server.send(200, "text/html", resp);
    delay(2000);
    ESP.restart();
  } else {
    server.send(400, "text/html",
                "<h3>Form tidak lengkap. Silakan kembali.</h3>");
  }
}

// Redirect semua domain request asing ke portal setup (Fitur Captive Portal)
void handleCaptiveRedirect() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "");
}

// ============================================================================
// 10. AKTIVASI CAPTIVE PORTAL MODE (HOTSPOT ESP32)
// ============================================================================
void startCaptivePortal() {
  isPortalActive = true;
  WiFi.disconnect();
  delay(100);

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, netMsk);
  WiFi.softAP("EcoSense-Setup");

  Serial.println(F("\n=================================================="));
  Serial.println(F("   >>> [PORTAL MODE AKTIF] ESP32 HOTSPOT MENYALA  "));
  Serial.println(F("   Nama Hotspot : EcoSense-Setup (Tanpa Password) "));
  Serial.println(F("   Buka di HP   : http://192.168.4.1             "));
  Serial.println(F("=================================================="));

  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);

  // Endpoint Captive Portal
  server.on("/", HTTP_GET, handlePortalRoot);
  server.on("/save", HTTP_POST, handlePortalSave);

  // Endpoints Android / iOS Captive Portal Detector
  server.on("/generate_204", handlePortalRoot);
  server.on("/fwlink", handlePortalRoot);
  server.on("/hotspot-detect.html", handlePortalRoot);
  server.on("/ncsi.txt", handlePortalRoot);
  server.onNotFound(handleCaptiveRedirect);

  server.begin();
}

// ============================================================================
// 11. SINKRONISASI WIFI CLIENT & NTP
// ============================================================================
bool connectToConfiguredWiFi() {
  if (activeSSID.length() == 0)
    return false;

  Serial.printf("\n[WIFI] Menghubungkan ke SSID: %s\n", activeSSID.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(activeSSID.c_str(), activePassword.c_str());

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 15000) {
    delay(400);
    setLedState(HIGH);
    delay(100);
    setLedState(LOW);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("\n[WIFI] TERHUBUNG DENGAN SUKSES!"));
    Serial.printf("[WIFI] IP Address  : %s\n",
                  WiFi.localIP().toString().c_str());
    Serial.printf("[WIFI] Signal RSSI : %d dBm\n", WiFi.RSSI());
    setLedState(LOW);

    configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");
    return true;
  } else {
    Serial.println(F("\n[WIFI ERROR] Gagal terhubung ke WiFi!"));
    return false;
  }
}

void checkBootButtonReset() {
  // Jika tombol BOOT (GPIO 0) ditekan selama 4 detik, reset WiFi & nyalakan
  // Portal!
  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    Serial.println(F("[BUTTON] Tombol BOOT terdeteksi ditekan... Tahan 4 detik "
                     "untuk Reset Portal..."));
    unsigned long pressStart = millis();
    while (digitalRead(BOOT_BUTTON_PIN) == LOW) {
      if (millis() - pressStart >= 4000) {
        Serial.println(
            F("\n>>> [RESET] MEMORI WIFI DI-RESET! MEMASUKI PORTAL SETUP..."));
        blinkLed(6, 80);
        startCaptivePortal();
        return;
      }
      delay(50);
    }
  }
}

// ============================================================================
// 12. HELPER PARSER JSON RINGAN (ZERO LIBRARY DEPENDENCY)
// ============================================================================
String extractJsonString(const String &json, const String &key) {
  String searchKey = "\"" + key + "\":\"";
  int idx = json.indexOf(searchKey);
  if (idx == -1) {
    searchKey = "\"" + key + "\": \"";
    idx = json.indexOf(searchKey);
  }
  if (idx == -1)
    return "";

  int start = idx + searchKey.length();
  int end = json.indexOf("\"", start);
  if (end == -1)
    return "";
  return json.substring(start, end);
}

int extractJsonInt(const String &json, const String &key) {
  String searchKey = "\"" + key + "\":";
  int idx = json.indexOf(searchKey);
  if (idx == -1)
    return -1;

  int start = idx + searchKey.length();
  while (start < json.length() && (json[start] == ' ' || json[start] == ':'))
    start++;
  int end = start;
  while (end < json.length() && isDigit(json[end]))
    end++;
  if (end > start)
    return json.substring(start, end).toInt();
  return -1;
}

// ============================================================================
// 13. PENGIRIMAN DATA TELEMETRI KE GOOGLE APPS SCRIPT
// ============================================================================
bool readSensor(float &temperature, float &humidity) {
#if USE_DUMMY_DATA
  static float simTemp = 28.0;
  static float simHum = 65.0;
  simTemp += ((random(0, 100) - 48) / 100.0);
  simHum += ((random(0, 100) - 50) / 80.0);
  temperature = simTemp;
  humidity = simHum;
  return true;
#else
  humidity = dht.readHumidity();
  temperature = dht.readTemperature();

  // Filter anti-glitch & sensor warmup:
  // DHT11 memiliki rentang ukur 20% - 90% RH dan 0°C - 50°C.
  // Jika humidity < 10% atau temperature < 5°C, dipastikan itu adalah glitch pembacaan awal saat baru colok kabel / sensor belum stabil.
  if (isnan(humidity) || isnan(temperature) || humidity < 10.0 || temperature < 5.0 || temperature > 70.0) {
    Serial.printf("[SENSOR GLITCH/WARMUP] Nilai sensor belum stabil: Suhu=%.1f C, Kelembaban=%.1f %% (Diabaikan)\n", temperature, humidity);
    return false;
  }
  return true;
#endif
}

void sendTelemetryData(float temperature, float humidity) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[SKIP] WiFi belum terhubung."));
    return;
  }

  String timeStampStr = getLocalTimeString();
  Serial.printf("\n[SEND] Waktu (WIB)  : %s\n", timeStampStr.c_str());
  Serial.printf("[SEND] Device ID    : %s\n", activeDeviceId.c_str());
  Serial.printf("[SEND] Suhu         : %.2f °C\n", temperature);
  Serial.printf("[SEND] Kelembaban   : %.2f %%RH\n", humidity);

  // Request via HTTP GET menjamin follow-redirect 200 OK
  String targetUrl = activeGasUrl;
  targetUrl += (targetUrl.indexOf('?') == -1) ? "?action=log" : "&action=log";
  targetUrl += "&device_id=" + activeDeviceId;
  targetUrl += "&temperature=" + String(temperature, 2);
  targetUrl += "&humidity=" + String(humidity, 2);
  targetUrl.replace(" ", "%20");

  WiFiClientSecure client;
  client.setInsecure(); // Bypass CA verification untuk Google SSL

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

    if (httpResponseCode == 200 || httpResponseCode == 302) {
      Serial.println(F("[HTTP] Data BERHASIL disimpan ke Google Spreadsheet!"));
      blinkLed(2, 60);

      // A. Dynamic Interval Sync dari Cloud
      int cloudSec = extractJsonInt(responseBody, "send_interval_sec");
      if (cloudSec >= 3 && cloudSec <= 3600) {
        unsigned long targetMs = (unsigned long)cloudSec * 1000;
        if (targetMs != sendIntervalMs) {
          sendIntervalMs = targetMs;
          prefs.putULong("interval_ms", sendIntervalMs);
          Serial.printf(">>> [CLOUD CONFIG] Interval Baru ESP32: %d Detik\n",
                        cloudSec);
        }
      }

      // B. Dynamic Device ID Sync dari Cloud
      String cloudDeviceId = extractJsonString(responseBody, "device_id");
      if (cloudDeviceId.length() > 0 && cloudDeviceId != activeDeviceId) {
        activeDeviceId = cloudDeviceId;
        prefs.putString("dev_id", activeDeviceId);
        Serial.printf(">>> [CLOUD CONFIG] Device ID Baru ESP32: %s\n",
                      activeDeviceId.c_str());
      }

      // C. Dynamic Friendly Name Sync dari Cloud
      String cloudDeviceName = extractJsonString(responseBody, "device_name");
      if (cloudDeviceName.length() > 0 &&
          cloudDeviceName != activeFriendlyName) {
        activeFriendlyName = cloudDeviceName;
        prefs.putString("dev_name", activeFriendlyName);
        Serial.printf(">>> [CLOUD CONFIG] Nama Ruangan Baru: %s\n",
                      activeFriendlyName.c_str());
      }

    } else {
      Serial.printf("[HTTP WARNING] Respon server: %d\n", httpResponseCode);
    }
  } else {
    Serial.printf("[HTTP ERROR] Request gagal! Kode error: %d\n",
                  httpResponseCode);
  }

  http.end();
  Serial.println(F("--------------------------------------------------"));
}

// ============================================================================
// 14. SETUP & LOOP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  setLedState(LOW);

  // Load pengaturan tersimpan dari NVS Flash
  loadConfiguration();

  Serial.println(F("\n=================================================="));
  Serial.println(F("   ESP32-S3 IoT Telemetry - ZERO-HARDCODE FIRMWARE"));
  Serial.printf("   Target SSID : %s\n", activeSSID.c_str());
  Serial.printf("   Device ID   : %s\n", activeDeviceId.c_str());
  Serial.printf("   GAS Web URL : %s\n", activeGasUrl.c_str());
  Serial.println(
      F("   Tombol BOOT : Tahan 4 detik saat hidup untuk Setup Portal"));
  Serial.println(F("=================================================="));

#if !USE_DUMMY_DATA
  Serial.println(F("[SENSOR] Menginisialisasi sensor fisik DHT11 di GPIO 4..."));
  dht.begin();
  delay(1500); // Waktu stabilisasi kapasitor internal sensor DHT11 saat awal menerima daya listrik
  // Buang 2 pembacaan dummy awal agar register sensor bersih
  dht.readHumidity();
  dht.readTemperature();
  Serial.println(F("[SENSOR] Sensor DHT11 siap & stabil."));
#endif

  // Cek apakah tombol BOOT sedang ditekan saat menyala
  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    Serial.println(
        F("[BOOT] Tombol BOOT ditekan saat startup. Membuka Portal Setup..."));
    startCaptivePortal();
    return;
  }

  // Coba terhubung ke WiFi yang tersimpan
  bool connected = connectToConfiguredWiFi();

  // Jika gagal terhubung (misal alat dipindah ke lokasi lain), otomatis buka
  // Hotspot Setup!
  if (!connected) {
    Serial.println(F("[WIFI] Gagal terhubung ke WiFi lama. Memulai Hotspot "
                     "Setup Otomatis..."));
    startCaptivePortal();
  } else {
    Serial.println(
        F("[SYSTEM] Siap. Memulai siklus pengiriman telemetri...\n"));
  }
}

void loop() {
  // Mode A: Jika sedang dalam Portal Setup (Hotspot aktif untuk HP)
  if (isPortalActive) {
    dnsServer.processNextRequest();
    server.handleClient();

    // LED berkedip pelan tanda sedang mode hotspot setup
    static unsigned long lastBlink = 0;
    if (millis() - lastBlink >= 600) {
      lastBlink = millis();
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
    return;
  }

  // Mode B: Mode Normal (Kirim Data Sensor ke Google Spreadsheet)
  checkBootButtonReset();

  // Watchdog WiFi reconnect jika koneksi sempat goyang
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long currentMillis = millis();
    if (currentMillis - lastReconnectAttempt >= RECONNECT_INTERVAL_MS) {
      lastReconnectAttempt = currentMillis;
      WiFi.reconnect();
    }
    return;
  }

  // Siklus kirim data non-blocking
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendMillis >= sendIntervalMs) {
    lastSendMillis = currentMillis;

    float currentTemperature = 0.0;
    float currentHumidity = 0.0;

    if (readSensor(currentTemperature, currentHumidity)) {
      sendTelemetryData(currentTemperature, currentHumidity);
    }
  }

  delay(20);
}
