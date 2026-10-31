# LaporAman — Panduan Demo Juri (5–7 Menit)

## Demo publik

Aplikasi: <https://laporaman-hackathon-v201.onrender.com>  
Health check: <https://laporaman-hackathon-v201.onrender.com/api/health>

## Persiapan sebelum juri datang

- Pastikan URL demo dapat dibuka melalui HTTPS dan endpoint `/api/health` menyatakan database terhubung.
- Siapkan akun demo dengan hak akses minimum dan password demo yang sudah diganti dari default.
- Siapkan satu laporan fiktif/dummy. Jangan gunakan data pribadi atau laporan masyarakat sungguhan.
- Pastikan admin telah membuat kunci publik instansi dan private key terenkripsi beserta password brankas tersedia untuk demonstrasi.
- Siapkan browser kedua/perangkat kedua untuk memperlihatkan sisi pelapor.
- Siapkan ZIP lokal sebagai cadangan jika koneksi internet atau server publik bermasalah.

## Urutan demonstrasi

1. **Masalah (30–45 detik):** jelaskan fragmentasi laporan, sulitnya pelacakan, dan perlunya perlindungan isi laporan.
2. **Pelaporan publik (1 menit):** isi laporan dummy, tunjukkan validasi dan pengiriman.
3. **Privasi (1 menit):** jelaskan bahwa isi laporan dienkripsi di browser sebelum dikirim; server menyimpan ciphertext dan metadata operasional. Jangan membuka DevTools berisi token atau data sensitif.
4. **Nomor tiket dan tracking (45 detik):** gunakan nomor tiket untuk melihat status dan audit trail.
5. **Dashboard petugas (1–2 menit):** login, buka private key instansi, tinjau laporan, rutekan ke OPD, dan ubah status.
6. **Verifikasi hasil (45 detik):** kembali ke tracker dan tunjukkan status terbaru.
7. **Batasan dan roadmap (30 detik):** terangkan bahwa klasifikasi saat ini berbasis kata kunci dan semua laporan memerlukan verifikasi manusia; integrasi IndoBERTweet/Whisper dan audit keamanan formal merupakan tahap lanjutan.

## Pertanyaan teknis yang perlu dijawab jujur

- **Apakah laporan tersimpan permanen?** Ya, pada database yang dikonfigurasi. Untuk demo lokal, SQLite tersimpan sebagai file `laporaman.db`; deployment bersama sebaiknya memakai PostgreSQL dengan volume persisten dan backup.
- **Apakah AI sudah menggunakan IndoBERTweet?** Belum. Klasifikasi sekarang adalah heuristik kata kunci untuk demonstrasi.
- **Apakah sistem sepenuhnya Zero-Knowledge?** Jangan klaim demikian. Desain mengenkripsi isi laporan di browser, tetapi metadata operasional tetap diproses server dan sistem belum menjalani audit independen.
- **Apakah sudah production-ready?** Belum. Ini prototipe hackathon; sebelum layanan publik diperlukan uji PostgreSQL/RLS, backup-restore, hardening deployment, threat model, dan audit keamanan/legal.
