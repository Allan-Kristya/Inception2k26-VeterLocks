# LaporAman Hackathon Demo — Release v2.0.1

**Tanggal rilis:** 31 Oktober 2026  
**Identitas backend:** `laporaman-hackathon-demo-v2.0.1`  
**Demo publik:** <https://laporaman-hackathon-v201.onrender.com>

## Ringkasan rilis

v2.0.1 merupakan paket demo full-stack yang digunakan pada deployment publik hackathon. Rilis ini memuat frontend pelaporan/tracker/dashboard, backend FastAPI, dukungan PostgreSQL, alur enkripsi di browser, autentikasi petugas, routing OPD, status bertahap, audit trail, dan worker SLA.

## Komponen utama

- Frontend HTML/CSS/JavaScript dan Web Crypto API.
- Backend FastAPI + SQLAlchemy.
- PostgreSQL melalui Neon pada deployment publik.
- Dockerfile untuk Render Web Service.
- Jalur SQLite dan Docker Compose dipertahankan sebagai opsi pengembangan lokal.
- Tes API, E2EE smoke test, serta panduan demo/pengembangan.

## Validasi deployment publik

Pengujian manual pada deployment publik telah dilaporkan berhasil:

- Endpoint `/api/health` menampilkan release `laporaman-hackathon-demo-v2.0.1` dan `database_status: connected`.
- Pelapor dapat mengirim laporan melalui URL publik.
- Administrator dapat membuka detail laporan dengan kunci instansi.
- Laporan dapat diverifikasi dan diteruskan ke OPD.
- Operator OPD dapat melihat, membuka, dan memproses laporan.
- Status dapat dimajukan hingga `Selesai`; tracker dan jejak audit menampilkan pembaruan.
- Data laporan tetap tersedia setelah service Render direstart.

## Batasan

Klasifikasi masih berupa heuristik kata kunci untuk demonstrasi dan memerlukan tinjauan manusia. IndoBERTweet, Whisper Large v3, aplikasi mobile native, dan audit keamanan independen belum tersedia. Keberhasilan alur demo tidak sama dengan sertifikasi keamanan atau kesiapan menerima data masyarakat sungguhan.
