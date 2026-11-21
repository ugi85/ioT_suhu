/**
 * ============================================================================
 * IoT Monitoring Suhu & Kelembaban - Backend Google Apps Script
 * File: /gas/Code.gs
 * ============================================================================
 * Fitur:
 * 1. doPost: Menerima data telemetri dari ESP32 & membalas dengan Remote Config
 * 2. doGet : Menyediakan data untuk Web Dashboard & menerima update Remote Config
 * 3. Database: Sheet "DataLog" untuk log data, Sheet "Config" untuk Remote Config
 * ============================================================================
 */

// Konfigurasi Nama Sheet & Waktu
const SHEET_NAME        = "DataLog";
const CONFIG_SHEET_NAME = "Config";
const TIMEZONE          = "Asia/Jakarta";
const DATE_FORMAT       = "yyyy-MM-dd HH:mm:ss";

// Ambang batas standar default jika belum ada di Config
const DEFAULT_CONFIG = {
  send_interval_sec: 10,
  temp_min: 18.0,
  temp_max: 30.0,
  hum_min: 40.0,
  hum_max: 70.0
};

/**
 * --------------------------------------------------------------------------
 * 1. Fungsi doPost(e) - Menerima Data Telemetri dari ESP32
 * --------------------------------------------------------------------------
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return createJsonResponse({
      status: "error",
      message: "Server sibuk (Lock timeout): " + err.toString()
    }, 503);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: "error",
        message: "Payload kosong atau tidak ditemukan."
      }, 400);
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({
        status: "error",
        message: "Format JSON tidak valid: " + parseErr.toString()
      }, 400);
    }

    const deviceId    = payload.device_id || "UNKNOWN_DEVICE";
    const temperature = payload.temperature !== undefined ? parseFloat(payload.temperature) : null;
    const humidity    = payload.humidity !== undefined ? parseFloat(payload.humidity) : null;

    if (temperature === null || isNaN(temperature) || humidity === null || isNaN(humidity)) {
      return createJsonResponse({
        status: "error",
        message: "Nilai temperature atau humidity tidak valid atau kosong."
      }, 422);
    }

    // Ambil konfigurasi aktif dari Cloud (Sheet Config)
    const activeConfig = getAppConfig();

    // Generate Timestamp zona Asia/Jakarta
    const now = new Date();
    const formattedTimestamp = Utilities.formatDate(now, TIMEZONE, DATE_FORMAT);

    // Hitung status berdasarkan ambang batas Cloud Config
    let status = "Normal";
    let warningNotes = [];

    if (temperature > activeConfig.temp_max) warningNotes.push("Suhu Tinggi");
    else if (temperature < activeConfig.temp_min) warningNotes.push("Suhu Rendah");

    if (humidity > activeConfig.hum_max) warningNotes.push("Kelembaban Tinggi");
    else if (humidity < activeConfig.hum_min) warningNotes.push("Kelembaban Rendah");

    if (warningNotes.length > 0) {
      status = "Warning: " + warningNotes.join(", ");
    }

    // Simpan baris baru ke sheet DataLog
    const sheet = getOrCreateDataLogSheet();
    sheet.appendRow([
      formattedTimestamp,
      deviceId,
      parseFloat(temperature.toFixed(2)),
      parseFloat(humidity.toFixed(2)),
      status
    ]);

    const newRowIndex = sheet.getLastRow();

    if (status !== "Normal") {
      const statusCell = sheet.getRange(newRowIndex, 5);
      statusCell.setBackground("#fef2f2").setFontColor("#dc2626");
    }

    // KRUSIAL UNTUK DYNAMIC REMOTE CONFIG:
    // Kembalikan konfigurasi terbaru di dalam respon agar ESP32 bisa langsung update interval!
    return createJsonResponse({
      status: "success",
      message: "Data berhasil disimpan ke spreadsheet.",
      row: newRowIndex,
      data: {
        timestamp: formattedTimestamp,
        device_id: deviceId,
        temperature: parseFloat(temperature.toFixed(2)),
        humidity: parseFloat(humidity.toFixed(2)),
        status: status
      },
      config: {
        send_interval_sec: activeConfig.send_interval_sec
      }
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "Internal Server Error: " + error.toString()
    }, 500);
  } finally {
    lock.releaseLock();
  }
}

/**
 * --------------------------------------------------------------------------
 * 2. Fungsi doGet(e) - REST API untuk Web Dashboard & Remote Config
 * --------------------------------------------------------------------------
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action ? params.action.toLowerCase() : "all";
    const limit  = params.limit ? Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 500) : 50;

    // A. ENDPOINT: PENGIRIMAN DATA TELEMETRI DARI ESP32 VIA GET (ANTI-REDIRECT 400)
    if (action === "log" || params.temperature !== undefined) {
      const deviceId    = params.device_id || "UNKNOWN_DEVICE";
      const temperature = parseFloat(params.temperature);
      const humidity    = parseFloat(params.humidity);

      if (!isNaN(temperature) && !isNaN(humidity)) {
        const activeConfig = getAppConfig();
        const now = new Date();
        const formattedTimestamp = Utilities.formatDate(now, TIMEZONE, DATE_FORMAT);

        let status = "Normal";
        let warningNotes = [];
        if (temperature > activeConfig.temp_max) warningNotes.push("Suhu Tinggi");
        else if (temperature < activeConfig.temp_min) warningNotes.push("Suhu Rendah");
        if (humidity > activeConfig.hum_max) warningNotes.push("Kelembaban Tinggi");
        else if (humidity < activeConfig.hum_min) warningNotes.push("Kelembaban Rendah");
        if (warningNotes.length > 0) status = "Warning: " + warningNotes.join(", ");

        const sheet = getOrCreateDataLogSheet();
        sheet.appendRow([
          formattedTimestamp,
          deviceId,
          parseFloat(temperature.toFixed(2)),
          parseFloat(humidity.toFixed(2)),
          status
        ]);

        const newRowIndex = sheet.getLastRow();
        if (status !== "Normal") {
          sheet.getRange(newRowIndex, 5).setBackground("#fef2f2").setFontColor("#dc2626");
        }

        return createJsonResponse({
          status: "success",
          message: "Data berhasil disimpan ke spreadsheet via GET.",
          row: newRowIndex,
          data: {
            timestamp: formattedTimestamp,
            device_id: deviceId,
            temperature: parseFloat(temperature.toFixed(2)),
            humidity: parseFloat(humidity.toFixed(2)),
            status: status
          },
          config: {
            send_interval_sec: activeConfig.send_interval_sec
          }
        });
      }
    }

    // B. ENDPOINT: SET REMOTE CONFIG DARI WEB DASHBOARD
    if (action === "set_config") {
      const updates = {};
      if (params.interval !== undefined) updates.send_interval_sec = parseInt(params.interval, 10);
      if (params.temp_min !== undefined) updates.temp_min = parseFloat(params.temp_min);
      if (params.temp_max !== undefined) updates.temp_max = parseFloat(params.temp_max);
      if (params.hum_min !== undefined) updates.hum_min = parseFloat(params.hum_min);
      if (params.hum_max !== undefined) updates.hum_max = parseFloat(params.hum_max);

      const updatedConfig = updateAppConfig(updates);
      return createJsonResponse({
        status: "success",
        message: "Konfigurasi Cloud berhasil diperbarui.",
        config: updatedConfig
      });
    }

    // B. ENDPOINT: GET CONFIG ONLY
    if (action === "get_config") {
      return createJsonResponse({
        status: "success",
        config: getAppConfig()
      });
    }

    // C. ENDPOINT: BACA DATA TELEMETRI (DataLog)
    const sheet = getOrCreateDataLogSheet();
    const lastRow = sheet.getLastRow();
    const activeConfig = getAppConfig();

    if (lastRow <= 1) {
      return createJsonResponse({
        status: "success",
        message: "Belum ada data sensor yang tersimpan.",
        latest: null,
        data: [],
        config: activeConfig
      });
    }

    const latestRowValues = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
    const latestData = {
      timestamp: formatCellDate(latestRowValues[0]),
      device_id: String(latestRowValues[1]),
      temperature: parseFloat(Number(latestRowValues[2]).toFixed(2)),
      humidity: parseFloat(Number(latestRowValues[3]).toFixed(2)),
      status: String(latestRowValues[4])
    };

    if (action === "latest") {
      return createJsonResponse({
        status: "success",
        data: latestData,
        config: activeConfig
      });
    }

    const totalDataRows = lastRow - 1;
    const rowsToFetch   = Math.min(limit, totalDataRows);
    const startRow      = lastRow - rowsToFetch + 1;

    const rangeValues = sheet.getRange(startRow, 1, rowsToFetch, 5).getValues();
    const historyData = rangeValues.map(function(row) {
      return {
        timestamp: formatCellDate(row[0]),
        device_id: String(row[1]),
        temperature: parseFloat(Number(row[2]).toFixed(2)),
        humidity: parseFloat(Number(row[3]).toFixed(2)),
        status: String(row[4])
      };
    });

    if (action === "history") {
      return createJsonResponse({
        status: "success",
        count: historyData.length,
        data: historyData,
        config: activeConfig
      });
    }

    // Default action="all"
    return createJsonResponse({
      status: "success",
      latest: latestData,
      count: historyData.length,
      data: historyData,
      config: activeConfig
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "Gagal memproses request GET: " + error.toString()
    }, 500);
  }
}

/**
 * --------------------------------------------------------------------------
 * 3. Helper: Kelola Sheet Config (Two-Way Remote Configuration)
 * --------------------------------------------------------------------------
 */
function getOrCreateConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    const headers = ["Key", "Value", "Description"];
    sheet.appendRow(headers);

    const defaultRows = [
      ["send_interval_sec", DEFAULT_CONFIG.send_interval_sec, "Interval pengiriman ESP32 ke server (detik)"],
      ["temp_min", DEFAULT_CONFIG.temp_min, "Batas minimal suhu normal (°C)"],
      ["temp_max", DEFAULT_CONFIG.temp_max, "Batas maksimal suhu normal (°C)"],
      ["hum_min", DEFAULT_CONFIG.hum_min, "Batas minimal kelembaban normal (%RH)"],
      ["hum_max", DEFAULT_CONFIG.hum_max, "Batas maksimal kelembaban normal (%RH)"]
    ];

    defaultRows.forEach(function(r) {
      sheet.appendRow(r);
    });

    const headerRange = sheet.getRange(1, 1, 1, 3);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0f766e"); // Teal 700
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 320);
  }
  return sheet;
}

function getAppConfig() {
  try {
    const sheet = getOrCreateConfigSheet();
    const data = sheet.getDataRange().getValues();
    const config = Object.assign({}, DEFAULT_CONFIG);

    for (let i = 1; i < data.length; i++) {
      const key = String(data[i][0]).trim();
      const val = parseFloat(data[i][1]);
      if (key && !isNaN(val)) {
        config[key] = val;
      }
    }
    return config;
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

function updateAppConfig(newValues) {
  const sheet = getOrCreateConfigSheet();
  const data = sheet.getDataRange().getValues();

  for (let key in newValues) {
    const val = parseFloat(newValues[key]);
    if (isNaN(val)) continue;

    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === key) {
        sheet.getRange(i + 1, 2).setValue(val);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, val, "Pengaturan Tambahan"]);
    }
  }
  return getAppConfig();
}

/**
 * --------------------------------------------------------------------------
 * 4. Helper: Kelola Sheet DataLog
 * --------------------------------------------------------------------------
 */
function getOrCreateDataLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ["Timestamp", "Device ID", "Temperature (°C)", "Humidity (%RH)", "Status"];
    sheet.appendRow(headers);

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1e293b"); // Slate 800
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");

    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 140);
    sheet.setColumnWidth(3, 140);
    sheet.setColumnWidth(4, 140);
    sheet.setColumnWidth(5, 180);
  }
  return sheet;
}

function formatCellDate(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, TIMEZONE, DATE_FORMAT);
  }
  return String(val);
}

function createJsonResponse(dataObject) {
  const output = ContentService.createTextOutput(JSON.stringify(dataObject));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
