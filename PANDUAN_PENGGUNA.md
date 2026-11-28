# 📘 PANDUAN PENGGUNA (USER MANUAL)
## Sistem Monitoring Suhu & Kelembaban IoT EcoSense

Selamat datang di **IoT EcoSense**! Dokumen ini adalah panduan resmi langkah demi langkah untuk mengaktifkan, menghubungkan, dan memantau alat IoT EcoSense Anda secara mandiri dengan mudah dan aman.

---

## 📋 Daftar Isi
1. [Keunggulan Sistem Mandiri & Privasi Data](#1-keunggulan-sistem-mandiri--privasi-data)
2. [Isi Dalam Paket Penjualan](#2-isi-dalam-paket-penjualan)
3. [Langkah 1: Membuat Database Pribadi (Google Spreadsheet)](#3-langkah-1-membuat-database-pribadi-google-spreadsheet)
4. [Langkah 2: Menghubungkan Alat ke WiFi Rumah/Kantor](#4-langkah-2-menghubungkan-alat-ke-wifi-rumahkantor)
5. [Langkah 3: Membuka & Mengaktifkan Dashboard Web](#5-langkah-3-membuka--mengaktifkan-dashboard-web)
6. [Langkah 4: Panduan Fitur Dashboard Web](#6-langkah-4-panduan-fitur-dashboard-web)
7. [Arti Indikator Lampu LED pada Alat](#7-arti-indikator-lampu-led-pada-alat)
8. [Cara Ganti WiFi / Pindah Lokasi (Reset Alat)](#8-cara-ganti-wifi--pindah-lokasi-reset-alat)
9. [Tanya Jawab & Solusi Kendala (FAQ)](#9-tanya-jawab--solusi-kendala-faq)

---

## 1. Keunggulan Sistem Mandiri & Privasi Data

Alat ini dirancang dengan arsitektur **Serverless Pribadi**:
* 🔒 **100% Privasi Terjamin:** Seluruh data suhu, kelembaban, dan rekaman riwayat tersimpan langsung di akun Google Drive pribadi Anda. Tidak ada pihak lain (termasuk penjual atau konsumen lain) yang dapat melihat data ruangan Anda.
* 💰 **Bebas Biaya Langganan Bulanan (Rp 0):** Memanfaatkan cloud gratis resmi dari Google Spreadsheet, sehingga Anda tidak perlu membayar biaya server bulanan sepeser pun.
* 📊 **Laporan Terbuka:** Data di Google Spreadsheet dapat Anda buka langsung, dicetak, atau diolah sewaktu-waktu.

---

## 2. Isi Dalam Paket Penjualan

Sebelum memulai, pastikan paket produk Anda berisi:
1. Unit Utama Sensor IoT EcoSense (Modul Mikrokontroler + Sensor Suhu & Kelembaban Presisi).
2. Kabel Daya USB (Tipe Micro-USB atau Type-C sesuai varian).
3. Buku Petunjuk / Kartu Tautan Aktivasi.

> **Catatan Daya:** Gunakan adaptor charger HP (5V / 1A atau 5V / 2A) atau port USB yang stabil untuk menyalakan alat.

---

## 3. Langkah 1: Membuat Database Pribadi (Google Spreadsheet)

> Estimasi waktu: **2 menit** (Hanya dilakukan **1 kali** saat pertama kali beli).

Untuk menampung data sensor, Anda cukup membuat salinan template database Google Spreadsheet yang telah kami sediakan:

### A. Salin Template Database
1. Buka browser di Laptop, Komputer, atau HP Anda, lalu buka tautan salinan template berikut:  
   👉 **`[MASUKKAN_LINK_TEMPLATE_SPREADSHEET_ANDA_DI_SINI]/copy`**
2. Anda akan diarahkan ke halaman Google. Klik tombol biru: **"Buat salinan"** (*Make a copy*).
3. File Spreadsheet baru otomatis tersimpan di Google Drive akun Google Anda sendiri. Anda bebas mengganti nama file spreadsheet tersebut (misalnya: *Data Suhu Toko Saya*).

### B. Publikasikan Script Server (Deploy Web App)
1. Pada Google Spreadsheet yang baru saja Anda salin, klik menu di bagian atas:  
   **Ekstensi** (*Extensions*) $\rightarrow$ **Apps Script**.
2. Tab baru editor skrip akan terbuka. Tunggu beberapa detik hingga proses memuat selesai.
3. Di pojok kanan atas, klik tombol biru **Terapkan** (*Deploy*) $\rightarrow$ pilih **Penerapan baru** (*New deployment*).
4. Pada jendela yang muncul, periksa pengaturan berikut:
   * **Jenis:** Klik ikon roda gigi $\rightarrow$ pilih **Aplikasi Web** (*Web app*).
   * **Deskripsi:** Ketik *Server IoT EcoSense* (opsional).
   * **Jalankan sebagai (Execute as):** **Saya (email Anda)** (*Me*).
   * **Yang memiliki akses (Who has access):** **Siapa saja** (*Anyone*) $\leftarrow$ **PENTING! Wajib pilih "Siapa saja" agar alat ESP dan Web dapat mengirim serta membaca data.**
5. Klik tombol **Terapkan** (*Deploy*).
6. Jika muncul jendela izin keamanan Google:
   * Klik **Beri Akses** (*Authorize access*) $\rightarrow$ Pilih akun Google Anda.
   * Jika muncul peringatan *"Google hasn't verified this app"*, klik tautan kecil di bawah: **Advanced** (*Lanjutan*) $\rightarrow$ klik **Go to IoT EcoSense (unsafe)** $\rightarrow$ klik **Allow** (*Izinkan*).
7. Salin teks **URL Aplikasi Web** (*Web App URL*) yang berakhiran `/exec`.  
   *Contoh format URL:*  
   `https://script.google.com/macros/s/AKfycb.../exec`
8. **Simpan URL ini di catatan HP/Laptop Anda.** URL inilah "kunci server" pribadi Anda.

---

## 4. Langkah 2: Menghubungkan Alat ke WiFi Rumah/Kantor

> Tanpa perlu install aplikasi atau colok ke komputer! Cukup pakai HP.

1. Hubungkan alat IoT EcoSense ke adaptor charger HP menggunakan kabel USB.
2. Lampu LED pada alat akan berkedip pelan menandakan alat dalam mode siap konfigurasi (*Captive Portal*).
3. Buka menu **Pengaturan WiFi** pada HP atau Laptop Anda:
   * Cari dan sambungkan ke WiFi bernama: **`EcoSense-Setup`** (atau nama yang berakhiran kode alat, contoh: `EcoSense-Setup-54312C`).
   * WiFi ini tidak menggunakan password (*Open Network*).
4. Setelah terhubung, layar **Portal Konfigurasi IoT EcoSense** akan otomatis muncul.
   * **Jika lewat Browser Laptop (Chrome/Edge):** Kadang muncul layar Windows *msftconnecttest.com* bertuliskan *"This site doesn't support a secure connection"*. Ini **sangat normal**. Cukup klik tombol **`Continue to site`**, atau buka tab baru dan ketik langsung: **`http://192.168.4.1`**.
   * **Jika lewat HP:** Biasanya langsung muncul notifikasi popup "Masuk ke jaringan WiFi".
5. Pada halaman portal:
   * **WiFi SSID:** Pilih atau ketik nama WiFi rumah / kantor Anda (Pastikan frekuensi 2.4 GHz).
   * **WiFi Password:** Masukkan kata sandi WiFi Anda.
   * **Google Apps Script URL:** Tempelkan (*paste*) **URL Web App** yang Anda dapatkan dari **Langkah 1**.
   * **Nama Ruangan / Device ID:** Beri nama ruangan lokasi alat akan dipasang (misal: *Ruang Server*, *Kamar Utama*, *Gudang Obat*, dll.), atau biarkan *AUTO*.
6. Klik tombol hijau: **"Simpan & Hubungkan"**.
7. Alat akan restart otomatis. Lampu LED akan berkedip **2 kali** tanda alat berhasil tersambung ke internet dan siap mengirim data!

---

## 5. Langkah 3: Membuka & Mengaktifkan Dashboard Web

Semua konsumen menggunakan **1 alamat link website dashboard utama yang sama**, namun masing-masing hanya akan melihat data dari alat miliknya sendiri:

### Cara Praktis 1: Menggunakan Magic Link (Sangat Disarankan)
Cukup buka tautan di browser Anda dengan menyertakan URL server Anda di bagian belakang:
```text
https://[ALAMAT-WEB-DASHBOARD-ANDA]/?gas=[TEMPEL_URL_WEB_APP_ANDA_DI_SINI]
```
*Sistem web akan otomatis mengenali, menyimpan ke memori browser Anda, dan langsung menampilkan grafik data ruangan Anda!*

### Cara Praktis 2: Melalui Menu Pengaturan Web Manual
1. Buka link web dashboard: `https://[ALAMAT-WEB-DASHBOARD-ANDA]`.
2. Saat pertama kali dibuka, web akan menampilkan status kuning: **"Server Belum Diatur"** dan otomatis membuka jendela pengaturan.
3. Tempelkan URL Web App Anda ke dalam kotak **Google Apps Script Web App URL**.
4. Klik tombol **Simpan Pengaturan**.
5. Status di pojok kanan atas akan berubah menjadi hijau: **Cloud Sync (Live)** dan data Anda langsung dimuat.

---

## 6. Langkah 4: Panduan Fitur Dashboard Web

Dashboard IoT EcoSense dilengkapi dengan fitur profesional:

### 1. Kartu Ringkasan Ruangan (Multi-Room Grid)
* Menampilkan suhu real-time ($^\circ\text{C}$), kelembaban ($\%\text{RH}$), dan status kenyamanan (*Normal* atau *Warning*).
* Indikator **Online / Offline**: Mengetahui apakah alat sedang aktif mengirim data atau sedang mati listrik.

### 2. Grafik Tren Telemetri
* Menampilkan riwayat pergerakan suhu dan kelembaban secara visual.
* **Pilihan Data:** Pilih melihat **15 Data**, **30 Data**, **50 Data**, atau **100 Data** terakhir.
* **Tombol Buka/Tutup (Toggle):** Klik tombol di samping judul grafik untuk melipat atau memperlebar tampilan grafik sesuai kenyamanan layar Anda.

### 3. Kelola Ruangan & Ambang Batas Alarm (Menu Gear ⚙️ $\rightarrow$ Kelola Ruangan)
* **Ubah Nama Ruangan:** Anda dapat mengganti nama alias alat kapan saja (misal: dari *Alat #1* menjadi *Laboratorium QC*).
* **Atur Batas Suhu & Kelembaban:** Tentukan batas aman minimum dan maksimum. Jika suhu melampaui batas ini, dashboard akan menampilkan peringatan merah dan membunyikan alarm bip.
* **Interval Kirim Alat:** Atur seberapa sering alat mengirim data (misal: 15 detik, 30 detik, atau 60 detik).

### 4. Filter Riwayat & Ekspor Laporan Excel (.xlsx)
* Terletak di bagian tabel riwayat paling bawah:
  * **Filter Ruangan:** Pilih hanya menampilkan ruangan tertentu atau semua ruangan.
  * **Filter Status:** Filter data normal atau data yang terkena peringatan/warning saja.
  * **Filter Waktu:** Pilih rentang *Semua Data*, *Hari Ini*, *Kemarin*, *7 Hari Terakhir*, atau *Pilih Tanggal Tertentu*.
  * **Pencarian Instan:** Ketik tanggal, jam, atau status untuk menyaring baris tabel seketika.
* **Tombol "Unduh XLSX":** Klik tombol ini untuk langsung mengunduh seluruh data hasil filter ke file Microsoft Excel (`.xlsx`) lengkap dengan kolom yang rapi untuk arsip atau audit.

### 5. Sistem Bebas Perawatan: Auto-Replace FIFO (Tanpa Perlu Hapus Manual)
* Database Google Spreadsheet Anda dilengkapi teknologi **Auto-FIFO (First-In, First-Out)**:
  * Kapasitas ideal disetel pada **10.000 data riwayat**.
  * Jika kapasitas mencapai batas, sistem akan **secara otomatis menimpa baris terlama dengan data pengukuran terbaru**.
  * Anda tidak perlu pusing membuka spreadsheet dan menghapus baris secara manual. Alat akan terus merekam 24 jam nonstop tanpa pernah macet atau terhenti.
  * Di web dashboard, terdapat indikator kapasitas database dan sistem akan memberikan pengingat ramah jika kapasitas sudah mencapai $\ge 80\%$, sehingga Anda bisa mengunduh arsip laporan Excel terlebih dahulu jika diperlukan.

---

## 7. Arti Indikator Lampu LED pada Alat

Alat dilengkapi teknologi **Heartbeat Activity Pulse** yang hemat daya, tidak membuat alat panas, dan memberikan informasi diagnostik yang akurat:

| Pola Nyala Lampu | Status Alat | Keterangan |
| :--- | :--- | :--- |
| **Kedip 2x manis saat baru dicolok** | **WiFi Terhubung** | Alat sukses menyambung ke internet rumah/kantor Anda dan siap bekerja. |
| **Menyala ~150 milidetik lalu mati (Denyut)** | **Kirim Data Sukses** | Sensor berhasil dibaca dan data sukses tersimpan di Google Spreadsheet Anda. |
| **Mati (Padam) di sela interval** | **Standby Normal** | Menjaga modul tetap dingin dan menghemat listrik (99% waktu dalam keadaan mati). |
| **Kedip cepat 3x berturut-turut** | **Peringatan Sensor** | Kabel sensor kendor atau sensor terganggu. Periksa soket sensor putih. |
| **Kedip santai berulang (setiap 0.6 detik)** | **Mode Pengaturan (Hotspot)** | Alat memancarkan WiFi `EcoSense-Setup` karena belum ada WiFi atau reset ditekan. |

---

## 8. Cara Ganti WiFi / Pindah Lokasi (Reset Alat)

Jika Anda mengganti modem/password WiFi, atau alat dipindahkan ke gedung/rumah lain:

1. Pastikan alat sedang menyala (tercolok daya USB).
2. Temukan tombol kecil berlabel **`FLASH`** atau **`BOOT`** pada board alat Anda.
3. **Tekan dan tahan tombol tersebut selama 4 detik**, lalu lepaskan.
4. Lampu LED akan berkedip santai berulang, menandakan memori WiFi lama telah dibersihkan.
5. Buka kembali HP Anda, sambungkan ke WiFi **`EcoSense-Setup`**, lalu ulangi [Langkah 2](#4-langkah-2-menghubungkan-alat-ke-wifi-rumahkantor) untuk memasukkan WiFi baru.
*(Catatan: Anda tidak perlu membuat Spreadsheet baru, cukup masukkan URL Apps Script lama Anda).*

---

## 9. Tanya Jawab & Solusi Kendala (FAQ)

### Q1: Mengapa status di dashboard web bertuliskan "Server Belum Diatur"?
* **Solusi:** Buka menu pengaturan (ikon Gear ⚙️ di kanan atas), pastikan kotak **Google Apps Script Web App URL** telah terisi URL dari Langkah 1, lalu klik **Simpan Pengaturan**.

### Q2: Mengapa status di web bertuliskan "Gagal Terhubung ke API" / "Offline"?
* **Penyebab umum:** Saat melakukan **Deploy** di Google Apps Script (Langkah 1), opsi *Who has access (Yang memiliki akses)* belum disetel ke **"Anyone" (Siapa saja)**.
* **Solusi:** Buka Google Spreadsheet Anda $\rightarrow$ Ekstensi $\rightarrow$ Apps Script $\rightarrow$ Terapkan (*Deploy*) $\rightarrow$ Kelola Penerapan (*Manage deployments*) $\rightarrow$ Klik ikon pensil (Edit) $\rightarrow$ Ubah akses ke **Anyone (Siapa saja)** $\rightarrow$ Klik Deploy ulang.

### Q3: Apakah komputer / laptop harus selalu menyala agar alat bisa merekam data?
* **Tidak perlu.** Alat bekerja secara mandiri langsung ke internet cloud Google. Data akan terus tercatat 24 jam nonstop selama alat tercolok listrik dan terhubung WiFi, meskipun seluruh komputer dan HP Anda dalam keadaan mati.

### Q4: Apakah alat mendukung WiFi 5 GHz?
* Semua modul IoT mikrokontroler (ESP8266/ESP32) menggunakan jaringan **WiFi 2.4 GHz** standar (jangkauan lebih luas dan stabil menembus dinding). Pastikan router Anda mengaktifkan frekuensi 2.4 GHz.

### Q5: Mengapa saat konek ke WiFi `EcoSense-Setup` di laptop muncul tulisan "This site doesn't support a secure connection" (msftconnecttest)?
* **Penjelasan:** Ini adalah prosedur otomatis sistem operasi Windows saat mendeteksi hotspot baru. Windows mencoba membuka alamat tes `msftconnecttest.com` dengan protokol HTTPS (port 443). Karena alat IoT EcoSense adalah server lokal offline (HTTP port 80), browser Chrome/Edge menampilkan peringatan keamanan standar tersebut.
* **Solusi:** Sama sekali tidak berbahaya. Cukup klik tombol **`Continue to site`** untuk lanjut, atau buka tab baru lalu ketik **`http://192.168.4.1`** langsung di kolom alamat browser.

---

<div align="center">
  <p><strong>IoT EcoSense — Smart Environment Monitoring System</strong></p>
  <p><em>Jika Anda memerlukan bantuan teknis lebih lanjut, hubungi layanan bantuan pelanggan kami.</em></p>
</div>
