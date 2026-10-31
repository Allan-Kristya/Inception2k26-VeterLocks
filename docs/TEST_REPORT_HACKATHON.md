# LaporAman — Catatan Pengujian Hackathon

Tanggal: 31 Oktober 2026

## Pengujian yang dijalankan pada lingkungan kerja

| Pemeriksaan | Hasil |
|---|---|
| Backend API pytest | 10 passed |
| Persistensi laporan setelah instance aplikasi dimulai ulang (SQLite file) | Lulus |
| E2EE smoke test (pemilik, petugas, password salah) | Lulus pada pengujian sebelumnya dan perlu diulang setelah perubahan akhir |
| `node --check frontend/script.js` | Lulus pada pengujian sebelumnya |
| `node --check frontend/crypto.js` | Lulus pada pengujian sebelumnya |
| Docker Compose / PostgreSQL / RLS | Belum diuji: Docker CLI tidak tersedia di lingkungan kerja |
| Browser end-to-end pada Windows | Belum diuji: perlu dilakukan pada komputer demo |
| Deployment publik HTTPS | Belum dilakukan |

## Perubahan setelah pengujian

- Health endpoint memeriksa koneksi database runtime dengan `SELECT 1` dan mengembalikan HTTP 503 jika database tidak dapat diakses.
- Launcher Windows memeriksa apakah server sudah aktif, mencegah startup kedua pada port 8000, dan menunggu health check database sebelum membuka browser.
- Dependency driver PostgreSQL dipisah ke `backend/requirements-postgres.txt`, sehingga jalur Windows/SQLite tidak perlu memasang driver PostgreSQL yang tidak dipakai.
- Tes persistensi file SQLite ditambahkan untuk memastikan laporan masih dapat dilacak setelah aplikasi dibuat ulang.

## Pengujian wajib pada komputer demo

1. Jalankan `start-laporaman-windows.bat`.
2. Pastikan `/api/health` menunjukkan `database_status: connected`.
3. Kirim satu laporan dummy dan simpan nomor tiket.
4. Hentikan server dengan Ctrl+C lalu jalankan ulang launcher.
5. Lacak nomor tiket yang sama; laporan harus tetap ditemukan.
6. Login sebagai petugas, proses laporan, dan pastikan tracker menunjukkan status terbaru.
7. Uji logout/login, password salah, dan akses operator lintas OPD.
8. Jika menggunakan Docker, jalankan pengujian terpisah terhadap PostgreSQL dan RLS sebelum demo publik.


## Validasi rilis v1.0.1 (31 Oktober 2026)

| Pemeriksaan | Hasil |
|---|---|
| Backend API pytest setelah penambahan release marker | 10 passed |
| E2EE smoke test | Lulus: owner decrypt, staff decrypt, wrong-password rejection |
| Sintaks `frontend/script.js` | Lulus (`node --check`) |
| Sintaks `frontend/crypto.js` | Lulus (`node --check`) |
| Identitas rilis pada health check | `laporaman-hackathon-demo-v1.0.1` |

Perbaikan launcher: server pada port 8000 hanya digunakan ulang jika release marker cocok dan database health check menyatakan `connected`. Proses dari versi lama ditolak agar source code baru tidak diam-diam memakai backend/database dari folder lain.
