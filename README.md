# LaporAman — Full-stack prototype

Implementasi ini menghubungkan web client dengan backend FastAPI dan database SQL. PostgreSQL + Row-Level Security (RLS) menjadi konfigurasi deployment yang disarankan; SQLite disediakan untuk pengembangan lokal/test otomatis ketika Docker/PostgreSQL belum tersedia.

## Catatan penting saat membuka aplikasi

File `frontend/index.html` sekarang menggunakan path relatif (`./style.css` dan `./script.js`), sehingga stylesheet tidak lagi dicari pada root drive ketika file dibuka langsung. Jika memakai `file://`, halaman juga menampilkan peringatan mode preview lokal. Namun, aplikasi full-stack **tidak dapat berfungsi penuh melalui `file://`**: browser membatasi pemuatan JavaScript ES modules dan API relatif pada skema file. Untuk menjalankan fitur sebenarnya di Windows, double-click `start-laporaman-windows.bat`. Launcher akan menunggu endpoint health backend merespons sebelum membuka browser di `http://127.0.0.1:8000`. Panduan singkat ada di `MULAI-DI-SINI.txt`.

## Yang sudah bekerja

- Form laporan anon/non-anon; validasi; lampiran JPEG/PNG/WebP/PDF.
- E2EE di browser: kunci data acak AES-256-GCM, PBKDF2-HMAC-SHA256 310.000 iterasi untuk membungkus kunci pemilik, dan RSA-OAEP untuk membungkus kunci data bagi instansi. Payload identitas, deskripsi, lokasi, detail sensitif, dan lampiran berada di dalam ciphertext.
- Nomor registrasi dibuat server dengan bagian acak 8 karakter; data laporan dan audit trail disimpan di database.
- Public tracker mengembalikan metadata operasional dan ciphertext owner; isi hanya didekripsi di browser setelah kata sandi brankas yang benar diberikan.
- Login petugas dengan JWT server-side, hashing kata sandi scrypt, scope tenant/OPD, antrean human review, routing, status bertahap, statistik dashboard.
- RLS PostgreSQL untuk laporan, event audit, dan subscription webhook. Di SQLite, scope tenant/OPD tetap diperiksa oleh API, tetapi SQLite bukan implementasi RLS.
- Eskalasi SLA otomatis melalui worker backend; webhook HTTPS bertanda tangan HMAC-SHA256.
- REST API dengan OpenAPI 3.1.0; Swagger UI di `/docs`.
- Aksesibilitas: HTML semantik, label, live region, skip link, fokus keyboard, zoom 100–200%, kontras tinggi, font ramah baca, dikte/perintah suara browser.

## Jalankan lokal (Windows PowerShell)

Prasyarat: Python 3.11+ dan Node.js 20+ (Node hanya untuk tes kriptografi). Buka terminal di folder proyek ini:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
$env:PYTHONPATH = "."
$env:SEED_DEMO_USERS = "true"
$env:BOOTSTRAP_PASSWORD = "LaporAmanDemo!2026"
$env:JWT_SECRET = "local-dev-jwt-secret-change-before-deployment-2026"
$env:APP_ENCRYPTION_KEY = "local-dev-webhook-encryption-key-change-2026"
uvicorn app.main:app --reload --no-access-log
```

Buka `http://127.0.0.1:8000`. File database SQLite `laporaman.db` dibuat pada root proyek secara otomatis.

### Akun demo lokal

| Peran | Email | Kata sandi awal |
|---|---|---|
| Administrator Kota Surabaya | `admin.sby@laporaman.local` | `LaporAmanDemo!2026` |
| Operator Dinas PU Surabaya | `operator.pu@laporaman.local` | `LaporAmanDemo!2026` |
| Administrator Kabupaten Sidoarjo | `operator.sda@laporaman.local` | `LaporAmanDemo!2026` |

Kredensial ini hanya untuk localhost/demo. Ganti secret dan password bootstrap sebelum deployment, jangan gunakan seed demo untuk sistem publik. Pada `APP_ENV=production`, backend menolak secret default, seed demo aktif, atau SQLite. Password bootstrap hanya digunakan saat akun pertama kali dibuat. Untuk mengulang seed pada database SQLite, hentikan server dan hapus `laporaman.db` terlebih dahulu.

## Jalankan PostgreSQL dengan Docker Compose

Salin `.env.example` menjadi `.env`, ganti seluruh nilai secret termasuk `POSTGRES_APP_PASSWORD`, lalu jalankan dari root. Password PostgreSQL pada URL koneksi harus menggunakan karakter URL-safe. File `init-role.sh` membuat role runtime non-superuser dan memberi password dari environment (bukan hard-coded di SQL).

```bash
docker compose up --build
```

Web/API tersedia pada `http://localhost:8000`; dokumentasi API pada `http://localhost:8000/docs`. Compose menggunakan role admin hanya untuk bootstrap schema dan aplikasi memakai role runtime `laporaman_app` non-superuser/table owner sehingga PostgreSQL RLS dapat berlaku. Role runtime dibuat oleh `backend/postgres/init-role.sh` dengan `POSTGRES_APP_PASSWORD`. Jika kredensial role diubah setelah volume database dibuat, script init tidak dijalankan ulang secara otomatis; lakukan rotasi kredensial secara eksplisit di PostgreSQL dan samakan URL koneksi API.

## Alur penggunaan pertama

1. Masuk ke Dashboard instansi dengan akun administrator.
2. Buat kunci instansi. Pasangan RSA-OAEP dibuat di browser; private key diekspor, dienkripsi dengan PBKDF2/AES-GCM, lalu envelope ciphertext disimpan di server. Server tidak menerima private key plaintext.
3. Kembali ke Buat laporan. Pilih wilayah yang kunci publiknya sudah disiapkan. Isi formulir, tentukan anonim/non-anonim, masukkan kata sandi brankas, setujui metadata operasional, lalu kirim. Dalam mode anonim, identitas tidak diminta oleh formulir, tetapi narasi, foto, dokumen, atau lokasi masih dapat secara tidak langsung mengungkap identitas; periksa konten sebelum mengirim.
4. Simpan nomor tiket. Pada Tracker, kata sandi brankas membuka isi laporan di browser.
5. Petugas login, membuka kunci privat instansi menggunakan kata sandi brankas kunci, lalu memproses laporan dalam cakupan tenant/OPD token.

**Penting untuk pemulihan:** kata sandi brankas warga dan kata sandi brankas kunci instansi tidak dapat dipulihkan oleh server. Jika hilang, ciphertext terkait tidak dapat didekripsi. Kehilangan kunci privat instansi juga akan menghalangi petugas membuka laporan lama; siapkan prosedur backup offline terenkripsi sebelum penggunaan produksi. Rotasi kunci belum disediakan karena memerlukan re-envelope seluruh data key lama. Model E2EE ini mengasumsikan kode client yang disajikan ke browser adalah tepercaya; kompromi pada pipeline rilis/static hosting dapat mengubah client dan harus dimitigasi dengan secure build/release, CSP, review kode, dan audit independen.

## Bootstrap administrator tanpa akun demo

Untuk deployment dengan `APP_ENV=production` dan `SEED_DEMO_USERS=false`, mulai service agar schema/tenant dibuat, kemudian buat administrator pertama melalui koneksi database admin. Perintah meminta password secara interaktif dan tidak menaruh password di shell history:

```bash
docker compose exec api python -m app.cli create-admin --email admin@instansi.go.id --name "Administrator Instansi" --tenant sby
```

Akun administrator mengelola akun operator dari dashboard. Ganti password awal setelah login; perubahan password mencabut seluruh token lama untuk akun tersebut.

## Pengujian

Dari root proyek:

```bash
cd backend
python -m pip install -r requirements-dev.txt
$env:PYTHONPATH = "."
python -m pytest ../tests -q
cd ..
npm run test:e2ee
node --check frontend/script.js
node --check frontend/crypto.js
```

Test API berjalan terhadap SQLite in-memory; test E2EE menjalankan modul kriptografi yang sama dengan browser menggunakan Web Crypto pada Node.js.

## Batasan dan integrasi eksternal yang belum tersedia

- **IndoBERTweet / Parallel-CNN atau Bi-GRU / Focal Loss belum terintegrasi.** Klasifikasi saat ini adalah adapter kata kunci lokal untuk demonstrasi; confidence score tidak terkalibrasi sebagai probabilitas ML. Jangan gunakan sebagai keputusan otomatis pada layanan publik sebelum model dilatih, divalidasi, diuji bias, dan dipasang pada inference service. Backend sengaja tidak mengirim plaintext ke model pihak ketiga agar sifat E2EE tidak diam-diam dilanggar. Integrasi model perlu keputusan arsitektur (inference on-device, trusted enclave, atau alur persetujuan terpisah yang tidak mengklaim zero-knowledge).
- **Whisper Large v3 belum tersedia.** Dikte/perintah suara memakai Web Speech API browser dan tergantung dukungan browser/izin mikrofon.
- **KrakenD** disertakan sebagai contoh konfigurasi gateway di `backend/gateway/krakend.json`, tetapi tidak dijalankan oleh Compose default. FastAPI memvalidasi JWT dan limiter in-memory untuk perlindungan dasar; rate limiting terdistribusi harus dipindahkan ke gateway/Redis. Konfigurasi KrakenD saat ini masih contoh minimal dan perlu route upstream tambahan sebelum menjadi gateway penuh.
- **Kubernetes, mobile native iOS/Android, push FCM/APNs, WebSocket/SSE, dan konektor SPBE/Smart City spesifik instansi belum dideploy.** Tracker melakukan polling browser (bukan WebSocket), sedangkan SLA diproses oleh worker backend; untuk multi-replica produksi perlu scheduler/queue terkoordinasi dan observability.
- Webhook menyaring URL non-HTTPS dan alamat IP literal non-publik, tetapi pencegahan SSRF/DNS rebinding produksi tetap perlu egress firewall/proxy allowlist dan resolver yang aman.
- Key setup RSA dibuat di browser administrator pertama. Saat ini hanya satu keypair per tenant dan tidak ada proses rotasi/recovery. Gunakan prosedur backup kunci privat terenkripsi dan multi-approval sebelum pilot.
- SQLite development tidak menerapkan PostgreSQL RLS. Uji kebijakan RLS pada PostgreSQL deployment aktual sebelum menerima data sungguhan. Tidak ada access log Uvicorn di container untuk mengurangi jejak IP di log aplikasi; reverse proxy/WAF di depan backend juga harus menerapkan kebijakan log minimisasi data.
- Audit WCAG 2.1 AA formal, penetration test, threat modeling, audit KAMI/ISO 27001, DPIA, retensi/pemusnahan data, consent & legal review UU PDP, observability, backup/restore, dan disaster recovery belum dilakukan.

## Struktur proyek

```text
laporaman-fullstack/
├── frontend/                 # index.html, style.css, script.js, crypto.js
├── backend/
│   ├── app/                  # FastAPI, SQLAlchemy, JWT, RLS, webhook, SLA worker
│   ├── postgres/init-role.sh # Role runtime PostgreSQL
│   ├── gateway/krakend.json  # Contoh gateway opsional
│   ├── Dockerfile
│   └── requirements.txt
├── tests/                    # API & E2EE smoke tests
├── docs/PROPOSAL_ASLI.md
├── docker-compose.yml
└── .env.example
```
