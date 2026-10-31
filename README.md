# LaporAman — V3 Full-Stack Prototype

> Branch: `v3`  
> Acuan pengembangan: Proposal Inception 2026 dan source code awal LaporAman (V1).

LaporAman adalah prototipe platform pelaporan publik yang menghubungkan masyarakat dengan instansi pemerintah. V3 membawa proyek dari prototipe yang sebagian besar berjalan di browser menjadi prototipe **full-stack** dengan frontend web, REST API FastAPI, autentikasi petugas di server, penyimpanan SQL persisten, audit trail, alur peninjauan laporan, dan enkripsi payload di sisi browser.

**Status:** V3 sudah dapat dijalankan untuk demonstrasi dan pengujian lokal. V3 belum merupakan sistem layanan publik siap produksi dan belum mengintegrasikan seluruh teknologi yang disebutkan dalam proposal, seperti IndoBERTweet, Whisper, KrakenD aktif, dan Kubernetes.

---

## 1. Ringkasan perubahan V1 → V3

Perubahan utamanya bukan sekadar pembaruan tampilan. V1 sudah mempunyai antarmuka pelaporan, tracker, dashboard, kontrol aksesibilitas, voice command berbasis browser, klasifikasi kata kunci, dan beberapa primitive Web Crypto. Namun, sebagian besar penyimpanan dan proses otorisasi masih berjalan di browser atau `localStorage`; deskripsi dan lokasi laporan juga belum termasuk payload yang dienkripsi.

V3 mempertahankan fondasi tersebut, lalu memindahkan proses inti ke backend dan memperkuat alur keamanan serta persistensi data.

| Area | V1 — Source code awal | V3 — Implementasi sekarang |
|---|---|---|
| Arsitektur | Frontend dengan logika dan simulasi di browser | Frontend web + backend FastAPI + database SQL |
| Penyimpanan laporan | `localStorage` browser | SQLite persisten untuk development/demo; konfigurasi PostgreSQL untuk deployment |
| Nomor registrasi | Dibuat di sisi browser | Diterbitkan backend dengan constraint unik database dan bagian acak |
| Tracker | Membaca data lokal browser | Mengambil metadata, status, dan audit trail melalui REST API |
| Autentikasi petugas | JWT dan pemeriksaan akses disimulasikan di browser | JWT HS256 diterbitkan dan diverifikasi backend; password di-hash dengan scrypt |
| Isolasi tenant/OPD | Filter JavaScript yang dapat dimodifikasi klien | Scope tenant/OPD diperiksa backend; policy PostgreSQL RLS disediakan sebagai lapisan tambahan |
| Audit trail | Riwayat lokal | Event laporan disimpan pada tabel database dan dibaca melalui API |
| Human-in-the-loop | Antrean demonstrasi di UI | Review queue persisten; petugas dapat memverifikasi dan merutekan laporan |
| Enkripsi laporan | Sebagian data sensitif dienkripsi; deskripsi/lokasi belum seluruhnya terenkripsi | Deskripsi, lokasi, identitas, detail sensitif, dan lampiran dienkripsi di browser sebelum dikirim |
| Pengelolaan kunci | Belum ada alur kunci penerima instansi yang terhubung backend | DEK dibungkus untuk pelapor dan kunci publik instansi; private key instansi disimpan sebagai envelope terenkripsi |
| Dashboard | Menggunakan data lokal/simulasi | Statistik dan pengelolaan laporan mengambil data dari backend sesuai scope akun |
| SLA | Waktu dan eskalasi disimulasikan di browser | Worker backend memeriksa tenggat dan mencatat eskalasi |
| Webhook | Simulasi/fetch dari browser | Pengiriman dari backend dengan HMAC-SHA256 |
| REST API | Contoh spesifikasi dan titik integrasi | FastAPI menyediakan endpoint REST dan OpenAPI 3.1.0 |
| Startup aplikasi | Membuka halaman frontend secara terpisah | Launcher Windows menyiapkan environment, menjalankan API, dan membuka aplikasi melalui localhost |

### Fitur yang dipertahankan dari V1

- Formulir laporan anonim dan non-anonim.
- Pelacakan tiket dan tampilan riwayat status.
- Dashboard instansi dan ringkasan statistik.
- Triase kata kunci lokal sebagai demonstrasi.
- Dikte dan perintah suara menggunakan Web Speech API browser.
- Kontrol zoom hingga 200%, kontras tinggi, font alternatif, label semantik, skip link, dan fokus keyboard.
- Konsep integrasi webhook dan OpenAPI.

Fitur-fitur tersebut tidak semuanya baru di V3. Peningkatannya adalah sebagian proses yang sebelumnya lokal/simulasi sekarang dihubungkan ke backend dan database.

## 2. Fitur dan kemampuan yang ditambahkan/ditingkatkan di V3

### Backend dan database

- Backend REST API menggunakan **FastAPI**.
- Akses database menggunakan **SQLAlchemy**.
- **SQLite** dipakai sebagai database lokal untuk development dan demonstrasi.
- Konfigurasi **PostgreSQL** dan Row-Level Security (RLS) disediakan untuk deployment.
- Data laporan, pengguna petugas, tenant, event audit, dan konfigurasi webhook mempunyai model database.
- Nomor tiket diterbitkan backend, bukan hanya dibuat oleh browser.

### Autentikasi dan otorisasi

- Login petugas melalui endpoint backend.
- JWT HS256 dengan masa berlaku dan validasi klaim di server.
- Password petugas di-hash menggunakan scrypt.
- Scope tenant dan OPD berasal dari token yang diverifikasi terhadap data akun.
- Administrator dapat membuat akun operator sesuai cakupan instansinya.
- Perubahan password mencabut token lama melalui versi token akun.
- Bootstrap administrator pertama tersedia melalui CLI untuk deployment tanpa akun demo.

### Enkripsi payload di sisi browser

V3 memperluas enkripsi dari sebagian data sensitif menjadi seluruh isi payload laporan:

- **AES-256-GCM** untuk mengenkripsi payload.
- **PBKDF2-HMAC-SHA256 dengan 310.000 iterasi** untuk derivasi/pembungkusan kunci milik pelapor.
- Data Encryption Key (DEK) dibuat secara acak untuk setiap laporan.
- **RSA-OAEP 3072-bit** digunakan untuk membungkus DEK bagi instansi penerima.
- Private key instansi disimpan di server hanya dalam bentuk envelope terenkripsi, bukan private key plaintext.
- Deskripsi, lokasi kejadian, identitas, detail sensitif, dan lampiran dimasukkan ke payload ciphertext.

Backend tidak menyediakan endpoint dekripsi payload. Pelapor membuka salinan kunci miliknya di browser; petugas membuka salinan kunci instansi di browser menggunakan private key instansi.

**Batasan keamanan:** metadata operasional seperti tenant, nomor tiket, status, waktu, label/saran klasifikasi, flag anonim, dan tenggat SLA tetap diproses server. Karena itu, jangan menyebut sistem ini sebagai Zero-Knowledge mutlak tanpa threat modeling dan audit kriptografi independen. Password brankas pelapor dan administrator tidak dapat dipulihkan oleh server. Private key instansi harus memiliki prosedur backup offline terenkripsi sebelum penggunaan nyata.

### Workflow laporan, dashboard, dan integrasi

- Tracker publik membaca data tiket melalui API.
- Status, peninjauan, routing OPD, dan riwayat aktivitas dikelola melalui backend.
- Semua laporan baru masuk antrean peninjauan manusia sampai model klasifikasi server yang tervalidasi tersedia.
- Dashboard menggunakan data backend dengan pembatasan tenant/OPD.
- Worker backend memproses eskalasi SLA.
- Webhook dikirim server-side dengan tanda tangan HMAC-SHA256.
- Dokumentasi OpenAPI 3.1.0 tersedia melalui Swagger UI.

### Perbaikan startup V3

V3 juga memperbaiki kegagalan startup yang ditemukan pada paket sebelumnya. `openapi_version` tidak lagi diberikan sebagai argumen constructor `FastAPI`; versi OpenAPI ditetapkan melalui atribut aplikasi (`app.openapi_version = "3.1.0"`). Dengan begitu, backend tidak berhenti saat membuat instance FastAPI.

Launcher Windows menjalankan backend pada `127.0.0.1:8000` dan menyediakan pemeriksaan kesiapan endpoint `/api/health` sebelum membuka halaman aplikasi.

## 3. Teknologi yang digunakan

| Lapisan | Teknologi |
|---|---|
| Frontend | HTML5, CSS, JavaScript ES Modules |
| Backend | Python, FastAPI, Uvicorn |
| Database access | SQLAlchemy |
| Database development | SQLite |
| Database deployment | PostgreSQL |
| Authentication | JWT HS256 |
| Password hashing | scrypt |
| Client-side encryption | Web Crypto API, PBKDF2-HMAC-SHA256, AES-256-GCM, RSA-OAEP |
| Webhook signing | HMAC-SHA256 |
| API documentation | OpenAPI 3.1.0 / Swagger UI |
| Testing | pytest, HTTPX, Node.js Web Crypto smoke test |
| Container deployment | Docker Compose (opsional) |

## 4. Menjalankan aplikasi di Windows

### Prasyarat

- Python **3.11 atau lebih baru** dengan Python Launcher (`py`).
- Koneksi internet pada proses instalasi dependency pertama kali.
- Node.js 20+ hanya diperlukan untuk menjalankan smoke test E2EE.

### Cara paling mudah

1. Ekstrak project ke folder lokal.
2. Buka folder `laporaman-fullstack`.
3. Jalankan `start-laporaman-windows.bat`.
4. Launcher membuat virtual environment jika belum ada, memasang dependency backend, lalu menjalankan Uvicorn.
5. Aplikasi dibuka pada `http://127.0.0.1:8000`.
6. Periksa `http://127.0.0.1:8000/api/health` untuk memastikan backend aktif.

Jangan menjalankan `frontend/index.html` dengan double-click jika ingin menguji login, API, database, tracker, dan dashboard. Mode `file://` hanya untuk melihat tampilan dasar; gunakan alamat localhost untuk fungsi full-stack.

### Menjalankan secara manual

Buka PowerShell pada root project:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
$env:PYTHONPATH = "."
$env:SEED_DEMO_USERS = "true"
$env:BOOTSTRAP_PASSWORD = "LaporAmanDemo!2026"
$env:JWT_SECRET = "local-dev-jwt-secret-change-before-deployment-2026"
$env:APP_ENCRYPTION_KEY = "local-dev-webhook-encryption-key-change-2026"
$env:APP_ENV = "development"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Buka `http://127.0.0.1:8000`.

### Database lokal

Secara default V3 memakai SQLite. File `laporaman.db` dibuat otomatis pada root project `laporaman-fullstack/` setelah backend berhasil melakukan startup. Database tetap tersimpan setelah server dihentikan.

Akun demo lokal:

| Peran | Email | Password awal |
|---|---|---|
| Administrator Kota Surabaya | `admin.sby@laporaman.local` | `LaporAmanDemo!2026` |
| Operator Dinas PU Surabaya | `operator.pu@laporaman.local` | `LaporAmanDemo!2026` |
| Administrator Kabupaten Sidoarjo | `operator.sda@laporaman.local` | `LaporAmanDemo!2026` |

Akun tersebut hanya untuk demonstrasi localhost. Jangan gunakan kredensial demo atau secret default untuk deployment yang dapat diakses publik.

## 5. Setup kunci instansi sebelum mengirim laporan

1. Login ke Dashboard instansi menggunakan akun administrator.
2. Buat pasangan kunci enkripsi instansi dan tetapkan password brankas kunci.
3. Simpan password brankas secara aman. Private key instansi disimpan sebagai envelope terenkripsi.
4. Kembali ke formulir laporan, pilih wilayah yang sudah memiliki public key, lalu kirim laporan.
5. Simpan nomor tiket untuk pengujian tracker.

Jika kunci publik instansi belum disiapkan, pengiriman laporan untuk wilayah tersebut akan ditolak. Ini perilaku yang disengaja agar sistem tidak menyimpan laporan terenkripsi tanpa penerima yang dapat membukanya.

## 6. Menjalankan PostgreSQL dengan Docker Compose

V3 menyediakan konfigurasi PostgreSQL + API di `docker-compose.yml`. Sebelum menjalankan:

1. Salin `.env.example` menjadi `.env`.
2. Ganti seluruh password dan secret contoh dengan nilai acak yang kuat.
3. Gunakan karakter URL-safe untuk password PostgreSQL yang dimasukkan ke URL koneksi.
4. Jalankan dari root project:

```bash
docker compose up --build
```

Compose menggunakan koneksi administratif untuk bootstrap schema dan role runtime non-superuser untuk akses aplikasi. Policy PostgreSQL `ENABLE/FORCE ROW LEVEL SECURITY` tersedia pada tabel laporan, event laporan, dan subscription webhook.

**Catatan validasi:** policy RLS sudah ditulis di source code, tetapi harus diuji pada instance PostgreSQL sungguhan, termasuk percobaan akses lintas tenant dan lintas OPD. SQLite tidak mengimplementasikan RLS.

## 7. Pengujian

Dari root project:

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest ../tests -q
cd ..
npm run test:e2ee
node --check frontend/script.js
node --check frontend/crypto.js
```

Pengujian yang disertakan mencakup API health/OpenAPI, autentikasi, setup kunci, submit dan tracking, review/routing, pembatasan tenant/OPD, akun petugas, pergantian password/pencabutan token, webhook, dan validasi status. Smoke test E2EE memeriksa dekripsi oleh pemilik/petugas dan penolakan password yang salah.

Hasil pemeriksaan terakhir pada lingkungan pengembangan: **9/9 tes API lulus**, E2EE smoke test lulus, pemeriksaan sintaks JavaScript lulus, dan HTTP smoke test untuk halaman/aset/API lulus. Pengujian PostgreSQL RLS dan browser end-to-end belum berhasil dilakukan di lingkungan pemeriksaan; jalankan pengujian tersebut pada mesin dan browser target sebelum demo final.

## 8. Fitur yang belum terintegrasi / belum siap produksi

Hal-hal berikut tidak boleh dipresentasikan sebagai integrasi aktif di V3:

- **IndoBERTweet, Parallel-CNN/Bi-GRU, dan Focal Loss:** belum terintegrasi. Triase saat ini memakai kata kunci lokal sebagai saran demonstrasi. Confidence score bukan probabilitas ML yang tervalidasi. Backend tidak mempercayai skor dari browser untuk auto-dispatch; laporan tetap masuk human review.
- **Whisper Large v3:** belum terintegrasi. Dikte/perintah suara memakai Web Speech API browser dan bergantung pada dukungan browser serta izin mikrofon.
- **KrakenD:** hanya contoh konfigurasi minimal di `backend/gateway/krakend.json`, belum menjadi API gateway aktif pada Compose default. Rate limiter FastAPI bersifat in-memory/proses tunggal.
- **Kubernetes:** konfigurasi cluster dan deployment production belum tersedia.
- **Mobile native iOS/Android:** belum dibuat; yang tersedia adalah web app responsif.
- **Push notification dan WebSocket/SSE:** belum tersedia. Tracker menggunakan polling browser dan notifikasi browser; worker SLA berjalan di backend.
- **Integrasi SPBE/SP4N-LAPOR/Smart City spesifik instansi:** webhook dan OpenAPI menjadi titik awal, tetapi konektor serta proses persetujuan instansi belum dibuat.
- **Audit WCAG 2.1 AA, penetration test, audit KAMI/ISO 27001, threat model, DPIA, dan legal review UU PDP:** belum dilakukan secara formal.
- **Backup/restore, rotasi/pemulihan kunci, MFA/SSO, observability terpusat, serta disaster recovery:** belum tersedia secara lengkap.

V3 adalah prototipe untuk pengembangan dan demonstrasi, bukan layanan publik produksi.

## 9. Struktur direktori

```text
laporaman-fullstack/
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── crypto.js
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── security.py
│   │   └── cli.py
│   ├── gateway/krakend.json
│   ├── postgres/init-role.sh
│   ├── Dockerfile
│   ├── requirements.txt
│   └── requirements-dev.txt
├── tests/
│   ├── test_api.py
│   └── e2ee-smoke.mjs
├── docs/
│   ├── PROPOSAL_ASLI.md
│   ├── GAP_ANALYSIS.md
│   ├── ARCHITECTURE.md
│   └── FINAL_IMPLEMENTATION_REPORT.md
├── legacy-source/             # Snapshot source V1 untuk pembanding
├── docker-compose.yml
├── .env.example
├── package.json
├── start-laporaman-windows.bat
└── README.md
```

## 10. Catatan Git branch `v3`

Branch `v3` berisi implementasi full-stack dan perbaikan startup backend dibandingkan baseline V1. Source code awal tetap disimpan di `legacy-source/` untuk menjaga pembanding dan histori audit.

Contoh commit untuk README ini:

```bash
git add README.md
git commit -m "docs: add V3 implementation README"
```

---

**LaporAman — Inception 2026**  
UPN “Veteran” Jawa Timur
