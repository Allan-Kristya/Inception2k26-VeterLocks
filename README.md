# LaporAman — Platform Pelaporan Publik Aman

**Hackathon Demo · v2.0.1**  
Platform pengaduan publik dengan pelacakan status, alur verifikasi dan routing OPD, serta perlindungan isi laporan melalui enkripsi di browser.

## Demo publik

<https://laporaman-hackathon-v201.onrender.com>

| Akses | Tautan |
|---|---|
| **Aplikasi LaporAman** | <https://laporaman-hackathon-v201.onrender.com> |
| Status backend / health check | <https://laporaman-hackathon-v201.onrender.com/api/health> |
| Dokumentasi REST API (Swagger UI) | <https://laporaman-hackathon-v201.onrender.com/docs> |
| OpenAPI JSON | <https://laporaman-hackathon-v201.onrender.com/openapi.json> |

Health check rilis demo diharapkan menampilkan `status: ok`, `release: laporaman-hackathon-demo-v2.0.1`, `database: postgresql`, dan `database_status: connected`.

> **Catatan demo:** layanan web berjalan pada paket gratis sehingga request pertama setelah periode tidak aktif dapat membutuhkan waktu lebih lama untuk merespons. Gunakan data fiktif/dummy saja. Jangan memasukkan laporan masyarakat sungguhan, NIK, alamat, nomor telepon, dokumen, atau informasi sensitif ke lingkungan demonstrasi.

## Panduan penggunaan aplikasi

Aplikasi menyediakan tiga alur utama: pelaporan oleh warga, pelacakan oleh pelapor, dan penanganan oleh administrator/operator instansi.

### 1. Membuat laporan sebagai warga

1. Buka [aplikasi LaporAman](https://laporaman-hackathon-v201.onrender.com) dan pilih bagian **Buat laporan**.
2. Pilih wilayah laporan yang sesuai (demo menyediakan **Kota Surabaya** dan **Kabupaten Sidoarjo**).
3. Jelaskan kejadian secara jelas. Lokasi kejadian dan lampiran foto/PDF bersifat opsional.
4. Pilih **Kirim sebagai laporan anonim** bila tidak ingin mengisi identitas. Jika mode anonim tidak dipilih, lengkapi identitas yang diminta formulir.
5. Buat **kata sandi brankas laporan** minimal 10 karakter. Simpan kata sandi ini secara aman; kata sandi diperlukan untuk membuka kembali detail laporan dan tidak dapat dipulihkan oleh server.
6. Setujui pemberitahuan privasi, lalu klik **Enkripsi dan kirim laporan**.
7. Simpan nomor registrasi/tiket yang ditampilkan setelah pengiriman berhasil.

Isi laporan dan lampiran dienkripsi di browser sebelum dikirim. Mode anonim menghilangkan kolom identitas dari pengiriman, tetapi narasi, lokasi, foto, atau dokumen yang diunggah tetap dapat mengungkap identitas secara tidak langsung. Periksa konten sebelum mengirim.

### 2. Melacak laporan

1. Buka bagian **Lacak laporan**.
2. Masukkan nomor registrasi yang diperoleh setelah pengiriman.
3. Klik **Lacak laporan** untuk melihat status, jejak audit, dan tenggat SLA.
4. Untuk membuka kembali isi laporan milik sendiri, masukkan kata sandi brankas yang dibuat saat pengiriman, lalu klik **Dekripsi detail saya**.

Simpan nomor tiket dan kata sandi brankas secara terpisah dan aman. Nomor tiket digunakan untuk menemukan catatan pelaporan; kata sandi brankas digunakan untuk mendekripsi detail laporan.

### 3. Dashboard administrator instansi

Dashboard petugas diakses melalui navigasi **Dashboard instansi**. Akun administrator/operator tidak dipublikasikan di repository; gunakan akun demo yang diberikan oleh tim atau akun yang dibuat oleh administrator.

Administrator dapat:

1. Masuk menggunakan email dan kata sandi akun petugas.
2. Pada konfigurasi instansi awal, membuat pasangan kunci instansi menggunakan kata sandi brankas kunci (minimal 12 karakter). Lakukan hanya sekali untuk tenant yang belum memiliki kunci.
3. Menyimpan kata sandi brankas kunci dengan aman. Server menyimpan kunci publik dan envelope kunci privat terenkripsi; server tidak dapat memulihkan kata sandi brankas.
4. Membuat akun operator dan menetapkan cakupan OPD melalui bagian **Kelola akun petugas**.
5. Meninjau laporan yang masuk, membuka isi laporan dengan kunci privat instansi yang sudah dibuka, lalu memilih OPD tujuan dan menekan **Verifikasi & rutekan**.

Jika kunci privat belum dibuka pada sesi browser, masukkan kata sandi brankas kunci untuk membukanya. Kunci privat hasil dekripsi berada di memori sesi browser dan perlu dibuka kembali setelah sesi berakhir atau halaman dimuat ulang.

### 4. Dashboard operator OPD

1. Masuk ke **Dashboard instansi** menggunakan akun operator yang dibuat administrator.
2. Operator hanya melihat laporan sesuai tenant dan cakupan OPD pada akunnya.
3. Buka kunci privat instansi menggunakan kata sandi brankas kunci yang disampaikan melalui kanal aman.
4. Tinjau laporan yang diteruskan ke OPD, lalu majukan status sesuai hasil penanganan.

Alur status laporan pada demo: **Diterima → Terverifikasi → Diproses → Selesai**. Perubahan status dan tindakan petugas dicatat pada jejak audit dan dapat dilihat melalui pelacakan tiket.

### 5. Fitur aksesibilitas

Gunakan kontrol pada bagian atas aplikasi untuk mengubah ukuran teks (100–200%), mengaktifkan kontras tinggi, memilih font yang lebih mudah dibaca, atau mencoba perintah/dikte suara apabila didukung browser dan izin mikrofon tersedia.

## Privasi, keamanan, dan pemulihan kunci

- Detail laporan (deskripsi, identitas, lokasi, detail sensitif, dan lampiran) dienkripsi di sisi browser sebelum dikirim ke backend.
- Metadata operasional seperti wilayah, kategori/saran klasifikasi, status, routing OPD, waktu, dan SLA tetap diproses backend agar laporan dapat dikelola dan dilacak.
- Kata sandi brankas pelapor dan kata sandi brankas kunci instansi tidak dapat dipulihkan oleh server. Kehilangan kata sandi yang diperlukan dapat membuat ciphertext tidak dapat dibuka.
- Jaga kata sandi brankas kunci instansi. Kehilangan akses ke kunci privat instansi dapat menghalangi petugas mendekripsi laporan yang ditujukan kepada instansi.
- Jangan mengunggah file database, backup, private key, file `.env`, connection string, token, atau secret ke repository.
- Implementasi ini merupakan prototipe hackathon. Enkripsi di browser bukan sertifikasi Zero-Knowledge dan sistem belum menjalani audit keamanan independen atau penilaian kesiapan produksi.

## Cakupan fitur demo dan batasan

**Fitur yang tersedia:**

- Form pelaporan anonim/non-anonim, validasi, dan lampiran JPEG/PNG/WebP/PDF.
- Enkripsi isi laporan di browser menggunakan AES-256-GCM, PBKDF2-HMAC-SHA256, dan RSA-OAEP.
- Nomor registrasi, pelacakan status, SLA, serta jejak audit.
- Login petugas, pembatasan cakupan tenant/OPD, dashboard, antrean tinjauan manusia, routing, dan pemrosesan status.
- Backend FastAPI, PostgreSQL untuk deployment publik, dan dokumentasi OpenAPI 3.1.0.
- Pengaturan aksesibilitas dan dikte/perintah suara berbasis dukungan browser.

**Batasan yang perlu disampaikan saat demo:**

- Saran klasifikasi saat ini berbasis aturan/kata kunci untuk demonstrasi, bukan model IndoBERTweet atau model ML terlatih; semua laporan tetap memerlukan verifikasi manusia.
- Dikte/perintah suara menggunakan Web Speech API browser, bukan Whisper Large v3.
- Integrasi KrakenD, Kubernetes, aplikasi mobile native, push notification, dan konektor SPBE/Smart City spesifik instansi belum menjadi bagian deployment demo ini.
- Policy PostgreSQL RLS telah dibuat dan ENABLE/FORCE pada tabel `reports`, `report_events`, dan `webhook_subscriptions`. Namun, role runtime `laporaman_app` pada database Neon saat rilis ini memiliki atribut `BYPASSRLS=true`, sehingga policy RLS belum menjadi pembatas efektif untuk koneksi aplikasi. Pembatasan tenant/OPD saat ini juga bergantung pada otorisasi dan filter di backend. Perbaikan privilege menjadi `NOBYPASSRLS` serta pengujian akses silang tenant/OPD wajib dilakukan sebelum menggunakan data non-demo; perbaikan dan pengujian tersebut belum dinyatakan selesai. Penetration test, threat modeling, audit hukum/UU PDP, dan audit keamanan formal juga belum dilakukan.
- Sebelum menerima data masyarakat sungguhan diperlukan hardening, prosedur backup-restore dan pemulihan kunci, pengujian lintas tenant/OPD, serta review keamanan dan legal.

## AI Use Declaration

### Penggunaan AI selama pengembangan dan persiapan rilis

Tim menggunakan **ChatGPT** sebagai alat bantu pada tahap persiapan rilis v2.0.1, terutama untuk diskusi teknis/arsitektur, peninjauan source code, bantuan penelusuran masalah saat deployment, serta penyusunan dan penyuntingan dokumentasi. Saran atau keluaran AI diperlakukan sebagai bahan bantu, bukan keputusan final; tim tetap meninjau perubahan dan melakukan pengujian sebelum menggunakannya.

Deklarasi ini menjelaskan penggunaan AI yang diketahui dalam proses review dan persiapan rilis. Apabila anggota tim menggunakan alat AI lain atau menggunakannya untuk bagian implementasi lain, nama alat dan cakupannya perlu ditambahkan oleh tim sebelum submission.

### Penggunaan AI di aplikasi v2.0.1 yang dideploy

- **Tidak ada layanan LLM/API AI eksternal yang dipanggil oleh deployment publik v2.0.1 untuk memproses atau mengklasifikasikan laporan.**
- Saran triase pada frontend menggunakan pencocokan kata kunci deterministik (`local-keyword-demo`), bukan inferensi IndoBERTweet atau model machine learning terlatih. Nilai saran dari browser bukan keputusan final.
- Backend menandai laporan untuk tinjauan manusia dan tidak melakukan routing otomatis berdasarkan skor/label yang dikirim dari browser. Verifikasi serta pemilihan OPD dilakukan petugas.
- IndoBERTweet dan Whisper Large v3 merupakan rencana/komponen opsional pada direktori `enterprise/`; model tersebut tidak disertakan atau dijalankan pada deployment v2.0.1.
- Fitur dikte/perintah suara pada aplikasi menggunakan Web Speech API yang tersedia melalui browser. Ketersediaan dan pemrosesan suara mengikuti dukungan serta kebijakan browser/platform yang digunakan; fitur ini bukan integrasi Whisper Large v3.

## Third-Party Declaration

LaporAman v2.0.1 menggunakan layanan hosting, database, pustaka perangkat lunak, dan API bawaan browser dari pihak ketiga. Komponen tersebut tetap menjadi milik/pengelolaan penyedia masing-masing dan digunakan sesuai ketentuan serta lisensinya.

### Layanan pihak ketiga pada deployment publik

| Pihak/layanan | Penggunaan pada v2.0.1 | Referensi |
|---|---|---|
| [Render](https://render.com/) | Hosting dan deployment Docker untuk backend/API serta frontend yang disajikan oleh backend. | [Terms of Service](https://render.com/terms) |
| [Neon](https://neon.com/) | Managed PostgreSQL untuk penyimpanan data aplikasi pada deployment publik. | [Security & sub-processors](https://neon.com/security) · [Documentation](https://neon.com/docs) |
| Browser pengguna | Web Crypto API untuk operasi kriptografi, Web Speech API untuk dikte/perintah suara, serta Notifications API bila didukung dan diizinkan pengguna. | Implementasi mengikuti dukungan dan kebijakan browser masing-masing. |

### Pustaka runtime backend yang dideklarasikan langsung

Daftar berikut merangkum dependensi langsung pada `backend/requirements.txt` dan `backend/requirements-postgres.txt`. Dependensi transitif yang dipasang oleh masing-masing paket tidak dirinci satu per satu di tabel ini.

| Pustaka | Fungsi | Lisensi proyek |
|---|---|---|
| [FastAPI](https://github.com/fastapi/fastapi) | Framework REST API | MIT |
| [Uvicorn](https://github.com/Kludex/uvicorn) | ASGI application server | BSD-3-Clause |
| [SQLAlchemy](https://github.com/sqlalchemy/sqlalchemy) | ORM dan akses database | MIT |
| [PyJWT](https://github.com/jpadilla/pyjwt) | Pembuatan dan validasi JWT | MIT |
| [cryptography](https://github.com/pyca/cryptography) | Operasi kriptografi pada backend | Apache-2.0 OR BSD-3-Clause |
| [HTTPX](https://github.com/encode/httpx) | HTTP client untuk integrasi/request backend | BSD-3-Clause |
| [Psycopg 3](https://github.com/psycopg/psycopg) (`psycopg[binary]`) | Driver PostgreSQL | LGPL-3.0 |

Lisensi dan pemberitahuan hak cipta tetap mengikuti distribusi resmi setiap pustaka. Versi dependensi pada file requirements menggunakan rentang versi; untuk inventaris lisensi yang sepenuhnya presisi pada suatu build, buat dan simpan Software Bill of Materials (SBOM) dari environment hasil instalasi yang digunakan.

### Komponen opsional dan aset eksternal yang bukan bagian runtime utama

- Direktori `enterprise/ai_service/` memiliki dependensi opsional seperti PyTorch, Transformers, Safetensors, dan faster-whisper untuk eksplorasi integrasi model. Dependensi dan model tersebut **tidak termasuk dalam deployment publik v2.0.1**. Sebelum mengaktifkannya, tim perlu memeriksa lisensi pustaka, lisensi/ketentuan bobot model, sumber dataset, serta kewajiban atribusi masing-masing.
- Frontend aktif yang disajikan dari direktori `frontend/` tidak mendeklarasikan pustaka JavaScript pihak ketiga melalui CDN pada halaman utamanya; fitur kriptografi dan suara menggunakan API browser. `package.json` hanya menyediakan script smoke test dan tidak mendeklarasikan dependency runtime frontend.
- File `index.html` di root repository memiliki referensi Google Fonts untuk halaman/versi terpisah. Entry point aplikasi publik v2.0.1 dilayani dari `frontend/index.html`, yang tidak memuat referensi Google Fonts tersebut.
- Halaman dokumentasi API `/docs` menggunakan Swagger UI yang disediakan oleh mekanisme dokumentasi FastAPI. Aset dokumentasi tersebut merupakan komponen pihak ketiga yang terpisah dari alur pelaporan utama.

Deklarasi ini merangkum komponen yang teridentifikasi pada source dan konfigurasi release v2.0.1; deklarasi ini bukan pengganti pemeriksaan lisensi menyeluruh/SBOM untuk setiap build atau deployment.

## Informasi teknis

| Komponen | Teknologi |
|---|---|
| Frontend | HTML, CSS, JavaScript, Web Crypto API |
| Backend | Python, FastAPI, SQLAlchemy, Uvicorn |
| Database deployment | PostgreSQL pada Neon |
| Hosting aplikasi | Render Web Service (Docker) |
| API | REST, OpenAPI 3.1.0 |

## Dokumentasi dan pengembangan opsional

Bagian ini **tidak diperlukan untuk menggunakan demo online**. File-file berikut dipertahankan untuk pengembangan lokal, pengujian, atau deployment mandiri.

- [Panduan demo juri (5–7 menit)](docs/DEMO_GUIDE_HACKATHON.md) — urutan presentasi dan jawaban batasan teknis.
- [Catatan hasil pengujian](docs/TEST_REPORT_HACKATHON.md) — hasil pemeriksaan lokal dan deployment publik.
- [Ringkasan arsitektur](docs/ARCHITECTURE.md) — komponen dan aliran data.
- [Quick start lokal Windows](docs/opsional/QUICK_START_LOKAL_WINDOWS.md) — menjalankan backend lokal dengan SQLite.
- [Petunjuk singkat launcher Windows](docs/opsional/MULAI-DI-SINI.txt) — menggunakan `start-laporaman-windows.bat`.
- [Deployment mandiri VPS + HTTPS](docs/opsional/DEPLOYMENT_VPS_HTTPS.md) — alternatif self-hosting, bukan konfigurasi Render yang sedang digunakan.
- [`.env.example`](.env.example) dan [`docker-compose.yml`](docker-compose.yml) — template untuk lingkungan Docker/PostgreSQL lokal. Salin file contoh menjadi `.env` dan ganti seluruh placeholder sebelum menjalankan Compose.
- [`start-laporaman-windows.bat`](start-laporaman-windows.bat) — launcher demo lokal Windows; tidak diperlukan untuk demo publik.
- [`backend/requirements-dev.txt`](backend/requirements-dev.txt), [`tests/`](tests/), dan [`package.json`](package.json) — dependency/test pengembangan.

Virtual environment, database lokal, cache, file rahasia, dan direktori `.git` lokal tidak disertakan dalam paket source. Database SQLite lokal dibuat ulang saat aplikasi lokal dijalankan pertama kali.

## Struktur proyek

```text
LaporAman/
├── frontend/                  # UI publik, tracker, dashboard, Web Crypto
├── backend/
│   ├── app/                   # FastAPI, SQLAlchemy, autentikasi, SLA, RLS
│   ├── postgres/              # Inisialisasi role PostgreSQL
│   ├── gateway/               # Konfigurasi gateway contoh
│   ├── Dockerfile             # Image deployment Render
│   └── requirements*.txt
├── enterprise/                # Eksplorasi arsitektur enterprise terpisah
├── docs/                      # Panduan demo, arsitektur, pengujian
│   └── opsional/               # Panduan lokal dan self-hosting
├── tests/                     # Tes API dan E2EE smoke test
├── docker-compose.yml         # Opsional: PostgreSQL lokal
├── start-laporaman-windows.bat# Opsional: launcher lokal Windows
└── README.md
```
