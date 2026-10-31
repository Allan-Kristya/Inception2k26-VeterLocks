# LaporAman — Quick Start Hackathon

## Target demo

Versi hackathon memakai frontend + FastAPI + SQLite untuk jalur lokal paling sederhana. SQLite menyimpan data ke file `laporaman.db` di root folder project, sehingga laporan tetap ada setelah server dihentikan dan dijalankan kembali. Untuk demo multi-pengguna melalui internet, gunakan deployment PostgreSQL dan HTTPS; jangan membuka SQLite lokal ke internet.

## Jalankan di Windows

1. Ekstrak ZIP ke folder biasa (jangan jalankan langsung dari dalam ZIP).
2. Pastikan Python 3.11 atau lebih baru sudah terpasang dan perintah `py` tersedia.
3. Double-click `start-laporaman-windows.bat`.
4. Tunggu instalasi dependency dan browser terbuka pada `http://127.0.0.1:8000`.
5. Cek `http://127.0.0.1:8000/api/health`. Respons normal harus mencakup `release: laporaman-hackathon-demo-v2.0.1`, `status: ok`, dan `database_status: connected`. Jika launcher memberi tahu bahwa port 8000 digunakan versi lama, hentikan PID yang ditampilkan dengan `taskkill /PID <PID> /T /F`, lalu jalankan launcher lagi.
6. Dokumentasi API: `http://127.0.0.1:8000/docs`.

Jika startup gagal, jangan langsung menghapus `laporaman.db`. Simpan pesan error dari terminal dan kirimkan untuk diperiksa.

## Akun demo lokal

Semua akun menggunakan password awal `LaporAmanDemo!2026` pada mode demo lokal:

| Peran | Email |
|---|---|
| Administrator Kota Surabaya | `admin.sby@laporaman.local` |
| Operator Dinas PU Surabaya | `operator.pu@laporaman.local` |
| Administrator Kabupaten Sidoarjo | `operator.sda@laporaman.local` |

Kredensial ini hanya untuk demo lokal. Jangan gunakan pada deployment publik. Seed akun demo harus dinonaktifkan dan akun petugas dibuat dengan password masing-masing sebelum aplikasi dibuka ke internet.

## Alur demo singkat

1. Login sebagai `admin.sby@laporaman.local`.
2. Buka pengaturan kunci instansi dan buat kunci RSA tenant bila belum tersedia. Simpan backup private key terenkripsi beserta password brankasnya secara offline.
3. Logout atau buka tab privat, lalu kirim laporan dari form publik.
4. Simpan nomor tiket yang ditampilkan.
5. Buka tracker, masukkan nomor tiket, dan periksa status/jejak audit.
6. Login kembali sebagai admin. Buka kunci instansi menggunakan password brankas kunci, lalu proses antrean review, rutekan laporan ke OPD, dan ubah status sesuai urutan yang diizinkan.
7. Periksa tracker lagi untuk melihat perubahan status.

## Catatan penting

- Semua laporan masuk antrean verifikasi manusia pada versi demo ini. Klasifikasi kata kunci adalah saran demonstrasi, bukan IndoBERTweet dan bukan keputusan AI terverifikasi.
- Isi laporan dan lampiran dienkripsi di browser sebelum dikirim. Jangan menyebut sistem sebagai Zero-Knowledge tersertifikasi atau hasil audit keamanan independen.
- Password brankas pelapor dan private key instansi tidak dapat dipulihkan server. Kehilangan keduanya dapat membuat ciphertext tidak terbaca.
- Jangan memasukkan data pribadi atau laporan masyarakat sungguhan saat demonstrasi.
- Jangan pernah menghapus volume database dengan `docker compose down -v` jika ingin mempertahankan data PostgreSQL.
