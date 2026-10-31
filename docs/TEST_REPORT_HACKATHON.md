# LaporAman — Catatan Pengujian Hackathon v2.0.1

Tanggal validasi deployment publik: **31 Oktober 2026**

## Validasi otomatis pada source project

Hasil pengujian otomatis yang tercatat pada paket pengembangan:

| Pemeriksaan | Hasil |
|---|---|
| Backend API pytest | 10 passed |
| E2EE smoke test (owner decrypt, staff decrypt, wrong-password rejection) | Lulus pada pengujian sebelumnya |
| `node --check frontend/script.js` | Lulus pada pengujian sebelumnya |
| `node --check frontend/crypto.js` | Lulus pada pengujian sebelumnya |

## Validasi manual pada deployment publik

Deployment demo berjalan di Render dan menggunakan PostgreSQL Neon. Pengujian manual berikut telah dilakukan pada aplikasi publik dan dinyatakan berhasil:

| Pemeriksaan | Hasil |
|---|---|
| Aplikasi publik dapat dibuka melalui HTTPS | Lulus |
| `/api/health` melaporkan release `laporaman-hackathon-demo-v2.0.1` | Lulus |
| Koneksi runtime ke PostgreSQL (`database_status: connected`) | Lulus |
| Administrator dapat login | Lulus |
| Kunci enkripsi instansi dapat dibuat | Lulus |
| Laporan dummy dapat dikirim dari halaman publik | Lulus |
| Detail laporan dapat dibuka oleh administrator | Lulus |
| Administrator dapat memverifikasi dan merutekan laporan ke OPD | Lulus |
| Laporan muncul pada dashboard operator OPD | Lulus |
| Operator dapat membuka detail dan memajukan status | Lulus |
| Status akhir `Selesai`, tracker, dan jejak audit terverifikasi | Lulus |
| Data tetap tersedia setelah service Render direstart | Lulus |

## Batas cakupan validasi

- Pemeriksaan health dan alur aplikasi membuktikan bahwa backend terhubung ke PostgreSQL pada deployment demo; pemeriksaan ini **bukan** audit independen atas seluruh kebijakan RLS.
- Uji isolasi RLS lintas tenant/OPD secara terpisah masih diperlukan.
- Penetration test, threat modeling, audit keamanan/legal, uji backup-restore terjadwal, dan disaster-recovery drill belum dilakukan.
- Seluruh laporan yang digunakan untuk demo harus berupa data fiktif/dummy.

## Catatan pengujian lokal dan alternatif

Panduan menjalankan jalur SQLite pada Windows dan PostgreSQL Docker Compose dipindahkan ke [dokumen opsional](opsional/QUICK_START_LOKAL_WINDOWS.md). Pengujian lokal tidak boleh dianggap sebagai pengganti pengujian pada deployment publik.
