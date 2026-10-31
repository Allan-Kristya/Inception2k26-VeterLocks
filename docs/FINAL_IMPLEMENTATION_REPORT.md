# LaporAman — Laporan Audit dan Implementasi

Tanggal pemeriksaan: 31 Oktober 2026  
Acuan: Proposal Inception 2026 dan source code awal (`index.html`, `style.css`, `script.js`).

## 1. Kesimpulan

Source code awal adalah prototipe frontend dengan sebagian besar proses disimulasikan di browser/localStorage. Versi ini telah dikembangkan menjadi prototipe full-stack yang menjalankan frontend web, REST API FastAPI, autentikasi petugas, alur review/routing, audit trail persisten, SLA worker, webhook HMAC, serta penyimpanan SQL. SQLite digunakan untuk pengembangan dan tes otomatis; konfigurasi PostgreSQL 16 + Row-Level Security disediakan untuk deployment.

Payload isi laporan—deskripsi, lokasi, identitas, detail sensitif, dan lampiran—dienkripsi di browser sebelum dikirim. Server menerima ciphertext, envelope kunci untuk pemilik dan instansi, serta metadata operasional yang diperlukan. Backend belum menjalankan IndoBERTweet; karena itu seluruh laporan tetap masuk antrean human review. Skor klasifikasi lokal hanyalah saran demo dan tidak boleh menjadi dasar dispatch otomatis.

**Hasil saat ini adalah prototipe full-stack yang bisa dijalankan dan diuji, bukan sistem layanan publik siap produksi atau bukti audit keamanan/compliance.**

## 2. Hasil gap analysis

Matriks 20 kebutuhan pada proposal, kondisi source code awal, perubahan pasca-pengembangan, dan batasan implementasi dicatat lengkap dalam [`GAP_ANALYSIS.md`](GAP_ANALYSIS.md). Ringkasannya:

- **Sudah berjalan pada prototipe:** REST API/OpenAPI 3.1.0; JWT server-side; password hashing scrypt; pelaporan anonim/non-anonim; E2EE payload/lampiran; nomor tiket server; tracker publik; audit trail; dashboard; review/routing manual; akun operator; pergantian password dengan pencabutan token lama; SLA worker; webhook bertanda tangan.
- **Parsial:** multilabel/confidence (hanya heuristic lokal), human-in-the-loop (semua laporan masuk review hingga model AI tervalidasi), ekstraksi/routing OPD (manual), notifikasi (polling dan notifikasi browser, plus webhook), aksesibilitas dan voice command (belum audit formal), PostgreSQL RLS (policy tersedia tetapi belum dijalankan pada PostgreSQL nyata), API gateway (limiter proses tunggal dan contoh KrakenD).
- **Belum terintegrasi/deploy:** IndoBERTweet + CNN/Bi-GRU + Focal Loss; Whisper Large v3; KrakenD sebagai gateway aktif; Kubernetes; aplikasi native iOS/Android; push notification; WebSocket/SSE; konektor SPBE/SP4N-LAPOR/Smart City per instansi; audit KAMI/ISO dan audit WCAG formal.

## 3. Perubahan per file

### Frontend

- `frontend/index.html`: antarmuka responsif LaporAman; form laporan dan tracker; mode anonim; aksesibilitas; dashboard instansi; pengaturan kunci; manajemen akun; pergantian password; konfigurasi webhook; dokumentasi API. Copy UI diperbaiki agar tidak mengklaim IndoBERTweet/Whisper aktif. Path aset stylesheet dan modul JavaScript menggunakan URL relatif (`./style.css`, `./script.js`) agar tidak dicari dari root drive saat file HTML dibuka langsung; mode `file://` menampilkan peringatan bahwa API tetap perlu dijalankan melalui localhost.
- `frontend/style.css`: desain navy-kuning dipertahankan, dengan layout responsif, fokus keyboard, mode kontras tinggi, pembesaran teks sampai 200%, font mudah dibaca, dan reduced-motion.
- `frontend/script.js`: API client; validasi form; triase kata kunci demonstrasi; submit terenkripsi; tracking/polling; autentikasi/dashboard; review/routing; update status; statistik; webhook; voice commands; notifications; pengelolaan akun.
- `frontend/crypto.js`: PBKDF2-HMAC-SHA256 310.000 iterasi, AES-256-GCM, data encryption key acak, wrapping key untuk pemilik dan RSA-OAEP 3072-bit untuk instansi.

### Backend dan infrastruktur

- `backend/app/main.py`: FastAPI, login JWT, change password, provision operator, key management, create/track reports, review/routing, status workflow, analytics, webhook delivery, SLA worker, serving frontend, security headers dan rate limit dasar.
- `backend/app/models.py`: model tenant, akun petugas, report, audit events, webhook subscriptions.
- `backend/app/schemas.py`: validasi ketat payload API dan struktur envelope kriptografi.
- `backend/app/security.py`: password hash scrypt, JWT HS256, secret webhook terenkripsi.
- `backend/app/database.py`: koneksi SQLAlchemy, SQLite dev/test, migrasi kompatibilitas kecil, PostgreSQL FORCE RLS dan grant runtime.
- `backend/app/cli.py`: bootstrap administrator pertama dengan password prompt.
- `backend/postgres/init-role.sh`: membuat role runtime PostgreSQL non-superuser.
- `backend/gateway/krakend.json`: konfigurasi contoh KrakenD terbatas pada health endpoint; belum menjadi gateway lengkap.
- `backend/Dockerfile`, `docker-compose.yml`, `.env.example`: deployment container PostgreSQL + API, non-root API user, konfigurasi environment.
- `tests/`: test API dan smoke test Web Crypto. 
- `legacy-source/`: salinan source code awal untuk menjaga baseline dan memudahkan perbandingan.

## 4. Uji yang dilakukan

Perintah dijalankan dari root project:

```bash
cd backend
PYTHONPATH=. python -m pytest ../tests -q
cd ..
npm run test:e2ee
node --check frontend/script.js
node --check frontend/crypto.js
```

Hasil terakhir:

- **9/9 tes API lulus**: health/OpenAPI, autentikasi, key setup, submit/tracker, human review, tenant/OPD scoping, laporan anonim, provisioning akun, pergantian password/token revocation, webhook admin-only, validasi tiket dan transisi status, SLA completion timestamp, bootstrap admin CLI, dan penolakan SQLite pada mode production.
- **E2EE smoke test lulus**: pemilik dapat mendekripsi; petugas dapat mendekripsi dengan private key instansi; password salah ditolak.
- **JavaScript syntax check lulus** untuk `script.js` dan `crypto.js`.
- **HTTP smoke test lulus**: backend Uvicorn berjalan dengan SQLite; `/` mengembalikan HTML 200; `/style.css` dan `/script.js` mengembalikan 200; `/api/health` menandai database SQLite; `/openapi.json` menyatakan OpenAPI 3.1.0 dengan 15 path.
- **HTML static check:** tidak ditemukan ID duplikat pada markup utama.
- Docker Compose YAML berhasil diparse sebagai YAML.

## 5. Belum diuji / masih diperlukan

- Docker dan PostgreSQL server tidak tersedia dalam lingkungan pemeriksaan. Karena itu image container, PostgreSQL migration/role, serta kebijakan RLS belum benar-benar dijalankan dan diuji di database PostgreSQL. RLS perlu integration test nyata, termasuk percobaan cross-tenant dan cross-OPD.
- Chromium tersedia, tetapi percobaan browser automation untuk membuka aplikasi lokal diblokir kebijakan lingkungan (`net::ERR_BLOCKED_BY_ADMINISTRATOR`). Karena itu pengujian alur UI end-to-end, console browser, dan tampilan visual belum dapat diselesaikan. Pengujian visual desktop/mobile, pembaca layar NVDA/VoiceOver/TalkBack, keyboard-only, zoom 200%, dan audit WCAG 2.1 AA tetap perlu dilakukan pada perangkat/browser target.
- Tidak ada IndoBERTweet, Whisper, KrakenD aktif, Kubernetes, mobile native, push service, atau connector SPBE yang berjalan. Jangan mengiklankan komponen tersebut sebagai integrasi aktif.
- Belum ada MFA/SSO, reset password, backup/rotasi key tenant, disaster recovery, retry/dead-letter webhook, distributed rate limiter, observability terpusat, penetration test, threat-model review, DPIA, dan legal review UU PDP.
- Webhook memvalidasi HTTPS dan alamat publik saat registrasi serta sebelum delivery, tetapi DNS rebinding race masih perlu ditutup dengan egress firewall/proxy allowlist.
- E2EE bergantung pada client code yang dikirim ke browser tetap tepercaya. Secure build/release, review kode, CSP, dan audit independen diperlukan untuk penggunaan sensitif.

## 6. Cara menjalankan

Petunjuk pengembangan lokal, Docker Compose/PostgreSQL, demo account, bootstrap administrator, setup kunci instansi, API docs, dan batasan keamanan tersedia di [`README.md`](../README.md). Jalankan SQLite pada localhost untuk demo; gunakan PostgreSQL, TLS reverse proxy, secrets kuat, backup/restore, dan audit keamanan sebelum penggunaan publik.


## 7. Perbaikan path aset setelah uji pengguna

Setelah pengguna membuka `frontend/index.html` melalui `file://`, ditemukan path absolut `/style.css` dan `/script.js` yang membuat browser mencari aset dari root drive. Kedua referensi diperbaiki menjadi `./style.css` dan `./script.js`. Ditambahkan pula `start-laporaman-windows.bat` dan `MULAI-DI-SINI.txt`. Dibuka langsung melalui `file://`, halaman kini dapat menemukan stylesheet dan menampilkan pemberitahuan bahwa pemanggilan API/module penuh memerlukan server localhost. Uji path HTML memastikan kedua file aset ditemukan; uji HTTP memastikan `/style.css`, `/script.js`, dan `/crypto.js` merespons 200.
