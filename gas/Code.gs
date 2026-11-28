/**
 * ============================================================================
 * IoT Monitoring Suhu & Kelembaban - Backend Google Apps Script (Multi-Device)
 * File: /gas/Code.gs
 * ============================================================================
 * Fitur Utama Multi-Device & Dynamic Provisioning:
 * 1. doPost & doGet: Menerima telemetri dari banyak alat ESP32 sekaligus
 * 2. Dynamic Device Registry: Auto-registrasi alat baru berbasis Device ID / MAC
 * 3. Two-Way Remote Config Per-Alat: Setiap alat memiliki nama ruangan,
 *    interval pengiriman, dan ambang batas suhu/kelembaban masing-masing
 * 4. Multi-Room API: Menyediakan endpoint untuk Web Dashboard memantau status
 *    semua ruangan (online/offline, suhu, kelembaban, tren komparasi)
 * ============================================================================
 */

// Konfigurasi Nama Sheet & Waktu
const SHEET_NAME        = "DataLog";
const CONFIG_SHEET_NAME = "Config";
const DEVICE_SHEET_NAME = "DeviceConfig";
const TIMEZONE          = "Asia/Jakarta";
const DATE_FORMAT       = "yyyy-MM-dd HH:mm:ss";

// Konfigurasi Kapasitas Database & Auto-FIFO Rotation (Circular Buffer)
const MAX_STORAGE_ROWS  = 10000; // Batas maksimal baris per-sheet (10.000 baris riwayat data)
const BATCH_PURGE_ROWS  = 500;   // Hapus 500 baris terlama sekaligus saat penuh (Super cepat & hemat kuota eksekusi)

// Ambang batas standar default jika belum diatur secara spesifik
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

    return processIncomingTelemetry(payload);

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
 * 2. Fungsi doGet(e) - REST API untuk Web Dashboard & ESP32 Telemetri
 * --------------------------------------------------------------------------
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action ? params.action.toLowerCase() : "all";
    const limit  = params.limit ? Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 500) : 50;

    // A. ENDPOINT: PENGIRIMAN DATA TELEMETRI DARI ESP32 VIA GET (ANTI-REDIRECT 400)
    if (action === "log" || params.temperature !== undefined) {
      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
      } catch (err) {
        return createJsonResponse({ status: "error", message: "Lock timeout" }, 503);
      }
      try {
        return processIncomingTelemetry(params);
      } finally {
        lock.releaseLock();
      }
    }

    // B. ENDPOINT: KELOLA NAMA & KONFIGURASI PERANGKAT (DEVICE MANAGEMENT)
    if (action === "set_device" || action === "rename_device") {
      const oldDeviceId = String(params.old_id || params.device_id || "").trim();
      const newDeviceId = String(params.new_id || params.new_device_id || oldDeviceId).trim();

      if (!oldDeviceId) {
        return createJsonResponse({ status: "error", message: "Parameter device_id diperlukan." }, 400);
      }

      // Jika ada perubahan Device ID (misal dari ROOM_Server01 ke ROOM_01)
      let activeTargetId = oldDeviceId;
      if (newDeviceId && newDeviceId !== oldDeviceId) {
        renameDeviceIdentity(oldDeviceId, newDeviceId);
        activeTargetId = newDeviceId;
      }

      const updates = {};
      if (params.name !== undefined) updates.name = String(params.name).trim();
      if (params.interval !== undefined) updates.send_interval_sec = parseInt(params.interval, 10);
      if (params.temp_min !== undefined) updates.temp_min = parseFloat(params.temp_min);
      if (params.temp_max !== undefined) updates.temp_max = parseFloat(params.temp_max);
      if (params.hum_min !== undefined) updates.hum_min = parseFloat(params.hum_min);
      if (params.hum_max !== undefined) updates.hum_max = parseFloat(params.hum_max);

      const updatedDev = updateDeviceConfig(activeTargetId, updates);
      return createJsonResponse({
        status: "success",
        message: "Perangkat " + activeTargetId + " berhasil diperbarui.",
        device: updatedDev,
        devices: getAllDevicesList()
      });
    }

    // B2. ENDPOINT: HAPUS PERANGKAT DARI REGISTRY (DELETE DEVICE)
    if (action === "delete_device") {
      const deviceId = params.device_id;
      if (!deviceId) {
        return createJsonResponse({ status: "error", message: "Parameter device_id diperlukan." }, 400);
      }

      deleteDeviceConfig(deviceId);
      return createJsonResponse({
        status: "success",
        message: "Perangkat " + deviceId + " berhasil dihapus dari registry.",
        devices: getAllDevicesList()
      });
    }

    // C. ENDPOINT: AMBIL DAFTAR SEMUA PERANGKAT BESERTA STATUS TERKINI
    if (action === "get_devices") {
      return createJsonResponse({
        status: "success",
        devices: getAllDevicesList()
      });
    }

    // D. ENDPOINT: SET REMOTE CONFIG GLOBAL DARI WEB DASHBOARD
    if (action === "set_config") {
      const updates = {};
      if (params.interval !== undefined) updates.send_interval_sec = parseInt(params.interval, 10);
      if (params.temp_min !== undefined) updates.temp_min = parseFloat(params.temp_min);
      if (params.temp_max !== undefined) updates.temp_max = parseFloat(params.temp_max);
      if (params.hum_min !== undefined) updates.hum_min = parseFloat(params.hum_min);
      if (params.hum_max !== undefined) updates.hum_max = parseFloat(params.hum_max);

      const updatedConfig = updateAppConfig(updates);

      // Jika ada flag apply_all_devices=true, sinkronkan ke semua perangkat di DeviceConfig
      if (params.apply_all === "true" || params.apply_all_devices === "true") {
        applyConfigToAllDevices(updates);
      }

      return createJsonResponse({
        status: "success",
        message: "Konfigurasi Cloud berhasil diperbarui.",
        config: updatedConfig,
        devices: getAllDevicesList()
      });
    }

    // E. ENDPOINT: GET CONFIG ONLY
    if (action === "get_config") {
      return createJsonResponse({
        status: "success",
        config: getAppConfig(),
        devices: getAllDevicesList()
      });
    }

    // F. ENDPOINT: BACA DATA TELEMETRI (DataLog)
    const sheet = getOrCreateDataLogSheet();
    const lastRow = sheet.getLastRow();
    const activeConfig = getAppConfig();
    const devicesList  = getAllDevicesList();

    if (lastRow <= 1) {
      return createJsonResponse({
        status: "success",
        message: "Belum ada data sensor yang tersimpan.",
        latest: null,
        data: [],
        total_rows: 0,
        storage: {
          total_rows: 0,
          max_rows: MAX_STORAGE_ROWS,
          usage_percent: 0.0,
          is_auto_rotate_active: true
        },
        devices: devicesList,
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

    const totalDataRows = lastRow - 1;
    const storageInfo = {
      total_rows: totalDataRows,
      max_rows: MAX_STORAGE_ROWS,
      usage_percent: Math.min(100, parseFloat(((totalDataRows / MAX_STORAGE_ROWS) * 100).toFixed(1))),
      is_auto_rotate_active: true
    };

    if (action === "latest") {
      return createJsonResponse({
        status: "success",
        data: latestData,
        total_rows: totalDataRows,
        storage: storageInfo,
        devices: devicesList,
        config: activeConfig
      });
    }

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
        total_rows: totalDataRows,
        storage: storageInfo,
        data: historyData,
        devices: devicesList,
        config: activeConfig
      });
    }

    // Default action="all"
    return createJsonResponse({
      status: "success",
      latest: latestData,
      count: historyData.length,
      total_rows: totalDataRows,
      storage: storageInfo,
      data: historyData,
      devices: devicesList,
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
 * 3. Pemrosesan Data Telemetri Masuk (Digunakan doPost & doGet)
 * --------------------------------------------------------------------------
 */
function processIncomingTelemetry(params) {
  let rawDeviceId = String(params.device_id || "UNKNOWN_DEVICE").trim();
  const temperature = parseFloat(params.temperature);
  const humidity    = parseFloat(params.humidity);

  if (isNaN(temperature) || isNaN(humidity)) {
    return createJsonResponse({
      status: "error",
      message: "Nilai temperature atau humidity tidak valid atau kosong."
    }, 422);
  }

  // Filter proteksi server: tolak pencatatan jika sensor mengirim data glitch startup (misal suhu < 5°C atau kelembaban < 10% RH)
  if (humidity < 10.0 || temperature < 5.0 || temperature > 70.0) {
    return createJsonResponse({
      status: "ignored",
      message: "Data telemetri diabaikan karena pembacaan sensor awal belum stabil (glitch/warmup saat baru colok kabel)."
    });
  }

  // Cek apakah perangkat ini baru saja diubah Device ID-nya dari Web Dashboard (Redirect)
  const redirectNewId = getDeviceRedirectId(rawDeviceId);
  if (redirectNewId) {
    rawDeviceId = redirectNewId;
  }

  // Ambil atau daftarkan konfigurasi spesifik perangkat ini
  const devConfig = getOrCreateDeviceConfig(rawDeviceId);

  // Ambil konfigurasi global sebagai fallback
  const globalConfig = getAppConfig();

  // Evaluasi interval pengiriman & ambang batas khusus perangkat ini
  const activeInterval = devConfig.send_interval_sec || globalConfig.send_interval_sec || 10;
  const tempMin = devConfig.temp_min !== undefined ? devConfig.temp_min : globalConfig.temp_min;
  const tempMax = devConfig.temp_max !== undefined ? devConfig.temp_max : globalConfig.temp_max;
  const humMin  = devConfig.hum_min !== undefined ? devConfig.hum_min : globalConfig.hum_min;
  const humMax  = devConfig.hum_max !== undefined ? devConfig.hum_max : globalConfig.hum_max;

  // Format Waktu WIB
  const now = new Date();
  const formattedTimestamp = Utilities.formatDate(now, TIMEZONE, DATE_FORMAT);

  // Hitung status batas normal
  let status = "Normal";
  let warningNotes = [];

  if (temperature > tempMax) warningNotes.push("Suhu Tinggi");
  else if (temperature < tempMin) warningNotes.push("Suhu Rendah");

  if (humidity > humMax) warningNotes.push("Kelembaban Tinggi");
  else if (humidity < humMin) warningNotes.push("Kelembaban Rendah");

  if (warningNotes.length > 0) {
    status = "Warning: " + warningNotes.join(", ");
  }

  // Simpan baris baru ke sheet DataLog (Master Feed untuk Web Dashboard)
  const sheet = getOrCreateDataLogSheet();
  const rowValues = [
    formattedTimestamp,
    rawDeviceId,
    parseFloat(temperature.toFixed(2)),
    parseFloat(humidity.toFixed(2)),
    status
  ];
  sheet.appendRow(rowValues);

  const newRowIndex = sheet.getLastRow();
  if (status !== "Normal") {
    sheet.getRange(newRowIndex, 5).setBackground("#fef2f2").setFontColor("#dc2626");
  }

  // AUTO-FIFO ROTATION: Jaga agar ukuran spreadsheet tetap optimal & tidak pernah penuh
  enforceStorageAutoRotation(sheet);

  // OTOMATIS PISAH TAB SHEET PER-RUANGAN DI SPREADSHEET YANG SAMA (1 FILE, 1 URL)
  logToDedicatedRoomSheet(rawDeviceId, devConfig.name, rowValues);

  // Perbarui Last Seen & data terkini di registry DeviceConfig
  updateDeviceHeartbeat(rawDeviceId, formattedTimestamp, temperature, humidity, status);

  // Kirim respon balik lengkap dengan nama perangkat & interval dinamis untuk ESP32
  return createJsonResponse({
    status: "success",
    message: "Data telemetri berhasil disimpan.",
    row: newRowIndex,
    data: {
      timestamp: formattedTimestamp,
      device_id: rawDeviceId,
      device_name: devConfig.name || rawDeviceId,
      temperature: parseFloat(temperature.toFixed(2)),
      humidity: parseFloat(humidity.toFixed(2)),
      status: status
    },
    config: {
      send_interval_sec: activeInterval,
      device_id: rawDeviceId,
      device_name: devConfig.name || rawDeviceId
    }
  });
}

/**
 * --------------------------------------------------------------------------
 * 4. Helper: Kelola Registry Multi-Device (Sheet DeviceConfig)
 * --------------------------------------------------------------------------
 */
function getOrCreateDeviceConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DEVICE_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(DEVICE_SHEET_NAME);
    const headers = [
      "Device ID", 
      "Device Name / Ruangan", 
      "Interval (detik)", 
      "Suhu Min (°C)", 
      "Suhu Max (°C)", 
      "Kelembaban Min (%)", 
      "Kelembaban Max (%)", 
      "Last Seen", 
      "Last Temp", 
      "Last Hum", 
      "Last Status"
    ];
    sheet.appendRow(headers);

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0d9488"); // Teal 600
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");

    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150); // Device ID
    sheet.setColumnWidth(2, 180); // Device Name
    sheet.setColumnWidth(3, 110); // Interval
    sheet.setColumnWidth(4, 110); // Temp Min
    sheet.setColumnWidth(5, 110); // Temp Max
    sheet.setColumnWidth(6, 130); // Hum Min
    sheet.setColumnWidth(7, 130); // Hum Max
    sheet.setColumnWidth(8, 160); // Last Seen
    sheet.setColumnWidth(9, 90);  // Last Temp
    sheet.setColumnWidth(10, 90); // Last Hum
    sheet.setColumnWidth(11, 180);// Last Status
  }
  return sheet;
}

function getOrCreateDeviceConfig(deviceId) {
  const sheet = getOrCreateDeviceConfigSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(deviceId).trim()) {
      return {
        device_id: String(data[i][0]),
        name: String(data[i][1]) || String(data[i][0]),
        send_interval_sec: parseInt(data[i][2], 10) || DEFAULT_CONFIG.send_interval_sec,
        temp_min: parseFloat(data[i][3]) || DEFAULT_CONFIG.temp_min,
        temp_max: parseFloat(data[i][4]) || DEFAULT_CONFIG.temp_max,
        hum_min: parseFloat(data[i][5]) || DEFAULT_CONFIG.hum_min,
        hum_max: parseFloat(data[i][6]) || DEFAULT_CONFIG.hum_max
      };
    }
  }

  // Jika belum ada, auto-register perangkat baru dengan nama default ramah
  const defaultName = deviceId.startsWith("ESP32_") 
    ? "Ruang Monitoring (" + deviceId.substring(6) + ")" 
    : deviceId.replace(/_/g, " ");

  const globalConfig = getAppConfig();
  const newRow = [
    deviceId,
    defaultName,
    globalConfig.send_interval_sec || DEFAULT_CONFIG.send_interval_sec,
    globalConfig.temp_min || DEFAULT_CONFIG.temp_min,
    globalConfig.temp_max || DEFAULT_CONFIG.temp_max,
    globalConfig.hum_min || DEFAULT_CONFIG.hum_min,
    globalConfig.hum_max || DEFAULT_CONFIG.hum_max,
    Utilities.formatDate(new Date(), TIMEZONE, DATE_FORMAT),
    "-",
    "-",
    "Baru Terhubung"
  ];
  sheet.appendRow(newRow);

  return {
    device_id: deviceId,
    name: defaultName,
    send_interval_sec: globalConfig.send_interval_sec,
    temp_min: globalConfig.temp_min,
    temp_max: globalConfig.temp_max,
    hum_min: globalConfig.hum_min,
    hum_max: globalConfig.hum_max
  };
}

function updateDeviceHeartbeat(deviceId, timestamp, temp, hum, status) {
  const sheet = getOrCreateDeviceConfigSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(deviceId).trim()) {
      sheet.getRange(i + 1, 8, 1, 4).setValues([[
        timestamp,
        parseFloat(temp.toFixed(2)),
        parseFloat(hum.toFixed(2)),
        status
      ]]);
      return;
    }
  }
}

function updateDeviceConfig(deviceId, updates) {
  const sheet = getOrCreateDeviceConfigSheet();
  const data = sheet.getDataRange().getValues();
  let targetRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(deviceId).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    // Belum ada, create new row
    getOrCreateDeviceConfig(deviceId);
    return updateDeviceConfig(deviceId, updates);
  }

  if (updates.name !== undefined) sheet.getRange(targetRow, 2).setValue(updates.name);
  if (updates.send_interval_sec !== undefined) sheet.getRange(targetRow, 3).setValue(updates.send_interval_sec);
  if (updates.temp_min !== undefined) sheet.getRange(targetRow, 4).setValue(updates.temp_min);
  if (updates.temp_max !== undefined) sheet.getRange(targetRow, 5).setValue(updates.temp_max);
  if (updates.hum_min !== undefined) sheet.getRange(targetRow, 6).setValue(updates.hum_min);
  if (updates.hum_max !== undefined) sheet.getRange(targetRow, 7).setValue(updates.hum_max);

  return getOrCreateDeviceConfig(deviceId);
}

function deleteDeviceConfig(deviceId) {
  const sheet = getOrCreateDeviceConfigSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(deviceId).trim()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function renameDeviceIdentity(oldId, newId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateDeviceConfigSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(oldId).trim()) {
      sheet.getRange(i + 1, 1).setValue(newId);
      break;
    }
  }

  // Simpan mapping redirect di sheet Config agar ESP32 yang masih mengirim oldId langsung dialihkan ke newId
  const cfgSheet = getOrCreateConfigSheet();
  cfgSheet.appendRow(["redirect_id_" + oldId, newId, "Rename Device ID mapping"]);

  // Rename sheet Log_<oldId> jika ada
  try {
    const cleanOld = "Log_" + String(oldId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanNew = "Log_" + String(newId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const oldSheet = ss.getSheetByName(cleanOld);
    if (oldSheet && !ss.getSheetByName(cleanNew)) {
      oldSheet.setName(cleanNew);
    }
  } catch (e) {}
}

function getDeviceRedirectId(oldId) {
  try {
    const sheet = getOrCreateConfigSheet();
    const data = sheet.getDataRange().getValues();
    const key = "redirect_id_" + String(oldId).trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === key) {
        return String(data[i][1]).trim();
      }
    }
  } catch (e) {}
  return null;
}

function applyConfigToAllDevices(updates) {
  const sheet = getOrCreateDeviceConfigSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = i + 1;
    if (updates.send_interval_sec !== undefined) sheet.getRange(row, 3).setValue(updates.send_interval_sec);
    if (updates.temp_min !== undefined) sheet.getRange(row, 4).setValue(updates.temp_min);
    if (updates.temp_max !== undefined) sheet.getRange(row, 5).setValue(updates.temp_max);
    if (updates.hum_min !== undefined) sheet.getRange(row, 6).setValue(updates.hum_min);
    if (updates.hum_max !== undefined) sheet.getRange(row, 7).setValue(updates.hum_max);
  }
}

function getAllDevicesList() {
  const sheet = getOrCreateDeviceConfigSheet();
  const data = sheet.getDataRange().getValues();
  const list = [];
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    const devId = String(data[i][0]).trim();
    if (!devId) continue;

    const lastSeenStr = formatCellDate(data[i][7]);
    let isOnline = false;
    if (lastSeenStr && lastSeenStr !== "-") {
      const lastDate = new Date(lastSeenStr.replace(/-/g, "/"));
      const diffSec = Math.floor((now.getTime() - lastDate.getTime()) / 1000);
      const interval = parseInt(data[i][2], 10) || 10;
      // Perangkat dianggap online jika ada kiriman dalam 3x interval atau maksimal 180 detik
      isOnline = diffSec <= Math.max(interval * 3, 120);
    }

    list.push({
      device_id: devId,
      name: String(data[i][1]) || devId,
      send_interval_sec: parseInt(data[i][2], 10) || DEFAULT_CONFIG.send_interval_sec,
      temp_min: parseFloat(data[i][3]) || DEFAULT_CONFIG.temp_min,
      temp_max: parseFloat(data[i][4]) || DEFAULT_CONFIG.temp_max,
      hum_min: parseFloat(data[i][5]) || DEFAULT_CONFIG.hum_min,
      hum_max: parseFloat(data[i][6]) || DEFAULT_CONFIG.hum_max,
      last_seen: lastSeenStr,
      latest_temp: data[i][8] !== "-" ? parseFloat(data[i][8]) : null,
      latest_hum: data[i][9] !== "-" ? parseFloat(data[i][9]) : null,
      latest_status: String(data[i][10]),
      is_online: isOnline
    });
  }

  return list;
}

/**
 * --------------------------------------------------------------------------
 * 5. Helper: Kelola Sheet Config (Global Fallback Remote Configuration)
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
      ["send_interval_sec", DEFAULT_CONFIG.send_interval_sec, "Interval pengiriman standar (detik)"],
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
 * 6. Helper: Kelola Sheet DataLog
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

/**
 * --------------------------------------------------------------------------
 * 7. Helper: Otomatis Buat & Tulis ke Tab Sheet Masing-Masing Ruangan
 * --------------------------------------------------------------------------
 * Menjamin 1 file spreadsheet memiliki tab terpisah untuk tiap alat/ruangan
 * (misal: Log_ROOM_Server01, Log_ROOM_Lab02, Log_ROOM_Kantor03)
 * tanpa perlu membuat spreadsheet baru atau URL baru!
 */
function logToDedicatedRoomSheet(deviceId, deviceName, rowValues) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cleanId = String(deviceId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const targetSheetName = "Log_" + cleanId;
    let roomSheet = ss.getSheetByName(targetSheetName);

    if (!roomSheet) {
      roomSheet = ss.insertSheet(targetSheetName);
      const headers = ["Timestamp", "Device ID", "Ruangan", "Temperature (°C)", "Humidity (%RH)", "Status"];
      roomSheet.appendRow(headers);

      const headerRange = roomSheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#0d9488"); // Teal 600
      headerRange.setFontColor("#ffffff");
      headerRange.setHorizontalAlignment("center");

      roomSheet.setFrozenRows(1);
      roomSheet.setColumnWidth(1, 180);
      roomSheet.setColumnWidth(2, 140);
      roomSheet.setColumnWidth(3, 160);
      roomSheet.setColumnWidth(4, 130);
      roomSheet.setColumnWidth(5, 130);
      roomSheet.setColumnWidth(6, 180);
    }

    const roomRow = [
      rowValues[0], // Timestamp
      rowValues[1], // Device ID
      deviceName || deviceId, // Ruangan
      rowValues[2], // Temperature
      rowValues[3], // Humidity
      rowValues[4]  // Status
    ];

    roomSheet.appendRow(roomRow);
    if (rowValues[4] !== "Normal") {
      roomSheet.getRange(roomSheet.getLastRow(), 6).setBackground("#fef2f2").setFontColor("#dc2626");
    }

    // AUTO-FIFO ROTATION untuk tab per-ruangan
    enforceStorageAutoRotation(roomSheet);
  } catch (err) {
    // Non-blocking jika terjadi kendala pada tab per-ruangan
  }
}

/**
 * --------------------------------------------------------------------------
 * Helper: Auto-FIFO Circular Buffer (Auto-Rotate Data Terlama)
 * Menjaga spreadsheet tetap ringan, cepat, dan tidak pernah melebihi kuota.
 * Saat baris melebihi MAX_STORAGE_ROWS, sistem otomatis menghapus batch
 * data terlama (mulai baris 2) sehingga data baru selalu bisa masuk 24/7.
 * --------------------------------------------------------------------------
 */
function enforceStorageAutoRotation(targetSheet) {
  try {
    const lastRow = targetSheet.getLastRow();
    // Jika baris (di luar header baris 1) melebihi batas maksimal
    if (lastRow > (MAX_STORAGE_ROWS + 1)) {
      const rowsToDelete = Math.min(BATCH_PURGE_ROWS, lastRow - 1);
      // Hapus batch dari baris 2 (data terlama tepat di bawah header)
      targetSheet.deleteRows(2, rowsToDelete);
    }
  } catch (err) {
    console.warn("Gagal eksekusi auto-rotation pada sheet: " + err.toString());
  }
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
