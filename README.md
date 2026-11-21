# 🌐 Sistem IoT Monitoring Suhu & Kelembaban End-to-End
### ESP32 &bull; Google Apps Script &bull; Google Spreadsheet &bull; Web Dashboard Realtime

Sistem IoT lengkap dan siap produksi untuk monitoring suhu (°C) dan kelembaban relatif (%RH) secara realtime. Terdiri dari 3 pilar yang saling terhubung:
1. **Firmware ESP32:** Membaca sensor (DHT22 / SHT31) dan mengirim data via HTTPS POST (JSON) dengan penanganan HTTP 302 redirect khas Google Apps Script.
2. **Backend Google Apps Script (GAS):** Menerima data telemetri, mencatatnya ke Google Spreadsheet (`DataLog`), dan menyediakan REST API (`?action=latest` & `?action=history`).
3. **Web Dashboard Realtime:** Single-Page Application modern (HTML5, Tailwind CSS, Chart.js dual-axis) dengan auto-refresh tanpa reload, indikator ambang batas (threshold alert), dan fitur ekspor CSV.

---

## 📁 Struktur Direktori Proyek

```
project EkaCs/
├── esp32/
│   ├── firmware.ino       # Source code Arduino / ESP32 C++
│   └── platformio.ini     # Konfigurasi dependensi otomatis untuk PlatformIO
├── gas/
│   └── Code.gs            # Backend API Google Apps Script (doPost & doGet)
├── web/
│   └── index.html         # Web Dashboard Realtime (Tailwind CSS + Chart.js)
└── README.md              # Panduan instalasi dan deployment lengkap
```

---

## 🛠️ Panduan Langkah demi Langkah

---

### BAGIAN 1: Setup Backend Google Spreadsheet & Google Apps Script

Google Spreadsheet berfungsi sebagai database gratis dan aman, sementara Google Apps Script bertindak sebagai backend REST API tanpa perlu menyewa VPS.

#### 1. Buat Google Spreadsheet Baru
1. Buka browser dan kunjungi [Google Sheets](https://sheets.new).
2. Beri nama spreadsheet Anda, misalnya: `IoT EcoSense Database`.
3. Anda tidak perlu membuat sheet atau header tabel secara manual—skrip `Code.gs` akan membuatkan sheet `DataLog` dan format header secara otomatis saat data pertama kali masuk!

#### 2. Buka Apps Script Editor
1. Di menu Google Spreadsheet, klik menu **Extensions (Ekstensi)** &rarr; **Apps Script**.
2. Hapus semua kode default yang ada di dalam file `Code.gs`.
3. Buka file [`gas/Code.gs`](gas/Code.gs) dari proyek ini, lalu salin dan tempelkan seluruh kodenya ke editor Apps Script.
4. Klik ikon **Save (Simpan)** atau tekan `Ctrl + S`.

#### 3. Uji Coba Fungsi (Opsional tapi Disarankan)
1. Pada dropdown fungsi di sebelah tombol Run, pilih `testDoPost`.
2. Klik tombol **Run (Jalankan)**.
3. Saat pertama kali dijalankan, Google akan meminta **Review Permissions (Otorisasi Akses)**:
   - Klik **Review Permissions**.
   - Pilih akun Google Anda.
   - Klik **Advanced (Lanjutan)** &rarr; Klik **Go to Untitled project (unsafe)**.
   - Klik **Allow (Izinkan)**.
4. Periksa Google Spreadsheet Anda: Anda akan melihat sheet baru bernama `DataLog` telah dibuat lengkap dengan styling header dan 1 baris data uji coba!

#### 4. Deploy Sebagai Web App (**SANGAT PENTING**)
Agar ESP32 dan Web Dashboard dapat mengakses API ini, Apps Script harus di-deploy sebagai Web App dengan izin publik:
1. Di pojok kanan atas Apps Script, klik tombol biru **Deploy** &rarr; pilih **New deployment**.
2. Klik ikon gerigi (Select type) di samping kiri &rarr; pilih **Web app**.
3. Isi konfigurasi sebagai berikut:
   - **Description:** `IoT Telemetry API v1`
   - **Execute as:** `Me (email-anda@gmail.com)` *(Wajib pilih Me!)*
   - **Who has access:** `Anyone` *(Wajib pilih Anyone! Jika memilih 'Only myself', ESP32 akan gagal mengirim data).*
4. Klik tombol **Deploy**.
5. Salin **Web app URL** yang dihasilkan. Format URL akan menyerupai:
   ```text
   https://script.google.com/macros/s/AKfycbxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec
   ```
   > ⚠️ **Catatan Penting:** Simpan URL ini! URL ini akan dimasukkan ke `firmware.ino` pada ESP32 dan pada input konfigurasi di Web Dashboard.

---

### BAGIAN 2: Wiring Hardware & Setup Firmware ESP32

#### 1. Skema Pengkabelan (Wiring)

##### Pilihan A: Sensor DHT22 (Default)
| Pin DHT22 | Pin ESP32 DevKit | Keterangan |
| :--- | :--- | :--- |
| **VCC (Pin 1)** | `3.3V` atau `VIN (5V)` | Gunakan 3.3V jika modul sudah memiliki regulator |
| **DATA (Pin 2)** | `GPIO 4` | Hubungkan resistor pull-up 4.7kΩ–10kΩ ke VCC jika modul belum memilikinya |
| **NC (Pin 3)** | Tidak Terhubung | Pin kosong |
| **GND (Pin 4)** | `GND` | Ground |

##### Pilihan B: Sensor SHT31 (Alternatif I2C)
| Pin SHT31 | Pin ESP32 DevKit | Keterangan |
| :--- | :--- | :--- |
| **VIN** | `3.3V` | VCC Sensor |
| **GND** | `GND` | Ground |
| **SCL** | `GPIO 22` | I2C Clock ESP32 |
| **SDA** | `GPIO 21` | I2C Data ESP32 |

##### Indikator LED Built-in (GPIO 2)
- **Berkedip 2x cepat:** Paket data berhasil dikirim ke Google Apps Script (HTTP 200/302).
- **Berkedip 4x cepat:** Terjadi error pembacaan sensor atau kegagalan HTTP/WiFi.
- **Menyala terus:** Sedang mencoba menghubungkan ulang ke WiFi saat terputus.

---

#### 2. Instalasi Library

##### Jika menggunakan Arduino IDE:
Buka **Tools** &rarr; **Manage Libraries...**, cari dan instal:
1. `ArduinoJson` (oleh Benoit Blanchon) &rarr; Versi 6.x atau 7.x
2. `DHT sensor library` (oleh Adafruit)
3. `Adafruit Unified Sensor` (oleh Adafruit)
4. *(Opsional)* `Adafruit SHT31 Library` jika memakai SHT31

##### Jika menggunakan PlatformIO (VS Code / Antigravity):
Semua dependensi sudah otomatis terkonfigurasi di file [`esp32/platformio.ini`](esp32/platformio.ini). Anda cukup membuka folder proyek dan menekan tombol **Build** atau **Upload**.

---

#### 3. Edit Konfigurasi Firmware
Buka file [`esp32/firmware.ino`](esp32/firmware.ino) dan sesuaikan variabel di bagian paling atas:
```cpp
const char* WIFI_SSID         = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD     = "PASSWORD_WIFI_ANDA";
const char* GAS_WEB_APP_URL   = "https://script.google.com/macros/s/AKfycbxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec";
const char* DEVICE_ID         = "ESP32_ROOM_01";
const unsigned long SEND_INTERVAL_MS = 10000; // Kirim tiap 10 detik
```

Jika menggunakan SHT31, cukup ubah:
```cpp
#define ACTIVE_SENSOR       SENSOR_TYPE_SHT31
```

#### 4. Upload & Monitoring
1. Hubungkan ESP32 ke laptop menggunakan kabel data Micro-USB / Type-C.
2. Pilih board `DOIT ESP32 DEVKIT V1` dan port COM yang sesuai.
3. Tekan **Upload**.
4. Buka **Serial Monitor** pada baud rate `115200`.
5. Anda akan melihat log koneksi WiFi, sinkronisasi waktu NTP WIB, pembacaan sensor, dan respon HTTP dari Google Apps Script.

---

### BAGIAN 3: Menjalankan Web Dashboard Monitoring

Web Dashboard dibuat menggunakan HTML5 murni, Tailwind CSS, dan Chart.js via CDN tanpa memerlukan build tool (Node.js/npm).

#### 1. Menjalankan Dashboard
Anda dapat membuka file [`web/index.html`](web/index.html) dengan beberapa cara:
- **Cara Langsung:** Klik ganda (double click) file `index.html` untuk membukanya langsung di Google Chrome, Edge, atau Firefox.
- **Ekstensi VS Code / Antigravity:** Klik kanan file `web/index.html` &rarr; pilih **Open with Live Server**.
- **Static Hosting Gratis:** File ini siap langsung diunggah ke [GitHub Pages](https://pages.github.com/) atau [Cloudflare Pages](https://pages.cloudflare.com/) untuk diakses dari internet di mana saja.

#### 2. Menghubungkan Dashboard ke Google Apps Script
1. Buka Web Dashboard di browser.
2. Klik tombol **Konfigurasi** di pojok kanan atas.
3. Masukkan URL Web App Google Apps Script Anda ke kolom input **Google Apps Script Web App URL**.
4. Klik tombol **Uji Koneksi API** untuk memastikan status `Sukses`.
5. Sesuaikan interval polling (misal: 10 detik) dan batas ambang suhu/kelembaban yang diinginkan.
6. Klik **Simpan Pengaturan**.
7. Dashboard akan langsung melakukan polling secara otomatis dan menampilkan grafik serta data log terkini!

#### 3. Fitur Utama Dashboard
- **Live Cards:** Menampilkan suhu real-time, kelembaban, device ID, dan waktu update relatif ("5 detik lalu").
- **Indikator Ambang Batas (Threshold Alert):**
  - Kartu otomatis berubah warna menjadi merah/kuning jika suhu di luar 18–30°C atau kelembaban di luar 40–70%.
  - Dilengkapi banner peringatan dan opsi **Audio Alert (Beep)** via Web Audio API.
- **Deteksi Online/Offline Otomatis:** Jika perangkat tidak mengirimkan data lebih dari 60 detik, status perangkat otomatis berubah menjadi Offline.
- **Grafik Interaktif Dual-Axis:** Sumbu kiri untuk Suhu (°C, oranye) dan sumbu kanan untuk Kelembaban (%RH, cyan) dengan opsi tampilan 10, 25, atau 50 data terakhir.
- **Ekspor CSV:** Unduh seluruh log data telemetri ke file `.csv` yang kompatibel dengan Microsoft Excel hanya dengan satu klik.
- **Demo Mode:** Ingin memamerkan UI atau menguji dashboard tanpa menyalakan ESP32? Cukup klik "Nyalakan Demo Mode" di menu konfigurasi untuk memicu simulasi telemetri dinamis.

---

## 🔍 Solusi Masalah Populer (Troubleshooting)

### 1. ESP32 Gagal Terhubung ke WiFi
- Pastikan frekuensi WiFi adalah **2.4 GHz**. ESP32 tidak mendukung frekuensi WiFi 5 GHz.
- Periksa kembali SSID dan password di `firmware.ino`.

### 2. Sensor Membaca `NaN` (Not a Number)
- Pastikan kabel data terhubung ke `GPIO 4`.
- Periksa suplai daya sensor (beberapa sensor DHT22 memerlukan tegangan 5V VIN daripada 3.3V jika kabel panjang).
- Pastikan ada resistor pull-up 4.7kΩ–10kΩ di antara pin VCC dan DATA sensor DHT22.

### 3. ESP32 Error HTTP 302 atau Return Halaman Login Google
- **Penyebab:** Pada pengaturan deployment Google Apps Script, opsi **Who has access** tidak disetel ke **Anyone**.
- **Solusi:** Buka Apps Script &rarr; Deploy &rarr; Manage deployments &rarr; Edit &rarr; Ubah **Who has access** menjadi **Anyone** &rarr; Deploy versi baru.
- Pastikan kode ESP32 memiliki baris `http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);` (sudah tertulis di `firmware.ino`).

### 4. CORS Error pada Web Dashboard
- Google Apps Script Web App yang di-deploy dengan akses **Anyone** secara otomatis mengizinkan request lintas domain (CORS).
- Pastikan Anda menggunakan URL berakhiran `/exec` (bukan `/dev`).

---

## 📄 Lisensi
Proyek ini dibuat untuk keperluan monitoring lingkungan IoT terpadu. Bebas dimodifikasi dan dikembangkan untuk kebutuhan riset, industri, maupun komersial.
