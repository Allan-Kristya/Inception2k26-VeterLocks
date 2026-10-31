# LaporAman Hackathon Demo v1.0.1

Perbaikan rilis: launcher hanya menggunakan ulang server apabila `release` cocok dengan v1.0.1 dan database health check terhubung. Server versi lama yang masih memakai port 8000 sekarang ditolak dan PID-nya ditampilkan. Endpoint health menambahkan identitas rilis agar proses yang berjalan dapat diverifikasi.

# LaporAman Hackathon Demo — Release Notes

## Isi rilis

- Frontend LaporAman dan modul Web Crypto.
- Backend FastAPI + SQLAlchemy.
- Jalur SQLite untuk demo lokal Windows.
- Konfigurasi Docker Compose + PostgreSQL untuk deployment.
- Launcher `start-laporaman-windows.bat`.
- Tes API, tes E2EE, dan dokumentasi quick start/deployment/demo.

## Perbaikan dalam paket ini

- Health check memeriksa koneksi database runtime.
- Tes persistensi laporan setelah aplikasi dimulai ulang.
- Launcher Windows menghindari server ganda pada port 8000 dan menunggu health check siap.
- Driver PostgreSQL dipisahkan dari dependency jalur SQLite agar startup lokal lebih ringan.
- Port API Compose diikat ke localhost; akses publik sebaiknya melalui reverse proxy HTTPS.

## Status validasi

- Backend tests: 10 passed.
- E2EE smoke test: passed.
- JavaScript syntax checks: passed.
- Docker/PostgreSQL/RLS and public HTTPS deployment: not validated in the current execution environment; run the deployment smoke tests before presenting a public URL.

## Batasan produk

Klasifikasi masih heuristik kata kunci dan semua laporan memerlukan human review. IndoBERTweet, Whisper Large v3, native Android, dan audit keamanan independen belum tersedia. Jangan klaim fitur tersebut sudah berjalan.
