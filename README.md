# IoT EcoSense - Multi-Room Realtime Temperature & Humidity Monitoring

Sistem IoT Terpadu Pemantauan Suhu & Kelembaban Udara Multi-Ruangan Real-Time berbasis **ESP32 / ESP32-S3**, **Google Apps Script & Google Spreadsheet**, serta **Modern Web Dashboard (Tailwind CSS & Chart.js)**.

---

## 🌟 Fitur Utama Multi-Device & Dynamic Provisioning

1. **Zero-Hardcode WiFi Captive Portal (Konfigurasi via HP Tanpa Colok Laptop):**
   - Jika alat dibawa ke lokasi baru atau password WiFi diganti, ESP32 otomatis menyalakan WiFi Hotspot sendiri: `EcoSense-Setup`.
   - Cukup sambungkan HP/laptop ke WiFi tersebut, halaman pengaturan terbuka otomatis (Captive Portal) untuk memilih WiFi baru, memasukkan password, Device ID, dan URL Google Script.
   - Semua pengaturan disimpan permanen di memori flash NVS ESP32.
2. **Tombol Reset Fisik (Tombol BOOT GPIO 0):**
   - Tahan tombol **BOOT** selama 4 detik kapan saja untuk me-reset memori WiFi dan membuka kembali portal konfigurasi tanpa perlu flash ulang!
3. **Pemberian Nama Ruangan Dinamis (Two-Way Cloud Remote Naming):**
   - Nama ruangan ramah (misal: *Ruang Server Utama*, *Ruang Laboratorium*, *Ruang Kantor*) dapat diatur dan diubah kapan saja **langsung dari Web Dashboard** tanpa perlu upload ulang kode!
   - Begitu diubah di Web, nama baru otomatis dikirim ke ESP32 dan disimpan ke memori flash internal (**NVS Preferences**).
4. **Multi-Room Overview Grid:**
   - Memantau kondisi seluruh ruangan sekaligus dalam 1 layar berdampingan (Suhu, Kelembaban, Status Normal/Warning, serta status Online/Offline per-alat).
5. **Grafik Komparasi Antar-Ruangan (Multi-Line Chart):**
   - Membandingkan tren suhu antar ruangan secara langsung pada satu kurva waktu.
6. **Konfigurasi Ambang Batas & Interval Khusus Per-Ruangan:**
   - Ruang Server dapat diset interval cepat 5 detik dengan batas maksimal $27^\circ\text{C}$.
   - Ruang Kantor dapat diset interval hemat 30 detik dengan batas maksimal $30^\circ\text{C}$.
7. **Tabel Log Riwayat Canggih (Show View & Pagination):**
   - Pilihan jumlah baris data per halaman: **10**, **20**, **50**, **100**, atau **Semua Data**.
   - Paginasi bernomor, pencarian instan, filter status, pengurutan kolom (*click-to-sort*), dan ekspor CSV.

---

## 📁 Struktur Proyek

```text
project EkaCs/
├── esp32/
│   ├── firmware.ino       # Firmware ESP32/ESP32-S3 (Multi-Device, NVS Flash, Auto MAC)
│   └── platformio.ini     # Konfigurasi PlatformIO
├── gas/
│   └── Code.gs            # Backend Google Apps Script (Multi-Device Registry & REST API)
├── esp32/
│   ├── firmware.ino       # Firmware ESP32/ESP32-S3 (Multi-Device, NVS Flash, Auto MAC)
│   └── platformio.ini     # Konfigurasi PlatformIO
├── esp8266/
│   └── esp8266.ino        # Firmware NodeMCU ESP8266 (ESP-12E, EEPROM Flash, Auto MAC)
├── gas/
│   └── Code.gs            # Backend Google Apps Script (Multi-Device Registry & REST API)
├── web/
│   └── index.html         # Web Dashboard Multi-Ruangan Responsive (Tailwind + Chart.js)
└── README.md              # Dokumentasi & Panduan Lengkap
```

---

## 🔌 Skema Pin Hardware

### 1. Board ESP8266 (NodeMCU ESP-12E / ESP-12F)
| Kaki Sensor DHT11 | Pin NodeMCU ESP8266 | Keterangan pada Board |
| :--- | :--- | :--- |
| **`+` (VCC)** | **`3V`** (3.3V) | Pin kiri paling atas (di bawah tombol FLASH) |
| **`-` (GND)** | **`G`** (GND) | Pin kiri urutan ke-3 dari atas |
| **`out` (DATA)** | **`D2`** (GPIO 4) | Pin kiri urutan ke-14 dari atas |

* **Tombol Reset Portal:** Tombol **`FLASH`** pada board (D3 / GPIO 0) — tahan 4 detik untuk membuka WiFi `EcoSense-Setup`.
* **Pengaturan Arduino IDE:**
  * **Board:** `NodeMCU 1.0 (ESP-12E Module)`
  * **CPU Frequency:** `80 MHz`
  * **Flash Size:** `4MB (FS:2MB OTA:~1019KB)` atau `4MB (FS:1MB)`
  * **Upload Speed:** `115200` atau `921600`

### 2. Board ESP32 / ESP32-S3
| Kaki Sensor DHT11/22 | Pin ESP32-S3 | Keterangan |
| :--- | :--- | :--- |
| **`+` (VCC)** | **`3V3`** | Pin ke-1 kiri atas board |
| **`-` (GND)** | **`GND`** | Pin ke-1 kanan atas board |
| **`out` (DATA)** | **`GPIO 4`** | Pin ke-4 kiri atas board |

> **Penting untuk ESP32-S3 di Arduino IDE:**
> * `Tools -> USB CDC On Boot` : **Enabled** (Wajib agar Serial Monitor menyala di USB).
> * `Tools -> PSRAM` : **Disabled**.

---

## 🚀 Panduan Setup & Penerapan

### 1. Update Backend Google Apps Script (`Code.gs`)
1. Buka spreadsheet Google Anda (**EkaCs**).
2. Masuk ke menu **Extensions > Apps Script**.
3. Buka file `Code.gs`, hapus isinya dan tempel kode terbaru dari [`gas/Code.gs`](file:///c:/Users/bakekok/Desktop/project%20EkaCs/gas/Code.gs).
4. Klik **Save** (Ctrl + S), lalu klik **Deploy > Manage deployments > Edit > New version > Deploy**.

### 2. Upload Firmware ESP32 (`firmware.ino`)
1. Buka [`esp32/firmware.ino`](file:///c:/Users/bakekok/Desktop/project%20EkaCs/esp32/firmware.ino) di Arduino IDE.
2. Pengaturan di menu **Tools**:
   * **Board:** `ESP32S3 Dev Module`
   * **USB CDC On Boot:** `Enabled`
   * **PSRAM:** `Disabled`
   * **Port:** COM port board ESP32 Anda (misal `COM9`)
3. Klik tombol **Upload**.
4. **Zero-Hardcode Deployment:**
   * Jika WiFi sekitar berubah, ESP32 otomatis menyalakan WiFi `EcoSense-Setup`.
   * Sambungkan HP ke hotspot `EcoSense-Setup`, buka `192.168.4.1`, lalu simpan WiFi & Device ID baru.
   * Untuk reset ke mode portal kapan saja, cukup **tahan tombol BOOT selama 4 detik**.

### 3. Buka Web Dashboard (`index.html`)
1. Buka browser pada alamat: [http://127.0.0.1:5500/web/index.html](http://127.0.0.1:5500/web/index.html) (atau klik ganda file `web/index.html`).
2. Tekan **`Ctrl + F5`** untuk memuat antarmuka Multi-Ruangan terbaru.
3. Klik tombol **"Kelola Ruangan"** di pojok kanan atas untuk memberi nama ruangan sesuai keinginan Anda (misal: *Ruang Server Utama*, *Ruang Laboratorium*, *Ruang Kantor*).
4. Klik **Simpan Ruangan Ini** — nama ruangan dan konfigurasi akan langsung tersimpan ke Google Cloud dan otomatis disinkronkan ke ESP32!
