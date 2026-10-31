# LaporAman — Gap Analysis Proposal vs Source Code

**Basis audit:** Proposal Inception 2026, `index.html`, `style.css`, dan `script.js` yang diberikan pengguna. Pemeriksaan source code awal dilakukan sebelum perubahan. Hasil implementasi mengacu pada versi di direktori `frontend/` dan `backend/`.

## Ringkasan eksekutif

Source code awal merupakan prototipe frontend. Form laporan, pelacakan, dashboard, beberapa primitif Web Crypto, kontrol aksesibilitas, serta contoh API terlihat tersedia, tetapi penyimpanan, autentikasi, gateway, notifikasi, dan isolasi tenant pada versi awal masih berupa simulasi berbasis browser/localStorage. Deskripsi dan lokasi laporan awal juga belum dienkripsi walaupun UI menyampaikan klaim privasi yang luas.

Versi hasil pengembangan menambahkan backend FastAPI, SQLAlchemy, database SQLite untuk development/test dan PostgreSQL untuk deployment, JWT server-side, hash kata sandi scrypt, audit trail persisten, worker SLA, webhook HMAC, API OpenAPI 3.1.0, manajemen akun petugas, PostgreSQL RLS, dan E2EE pada payload laporan. Namun, model IndoBERTweet dan Whisper belum diintegrasikan; KrakenD/Kubernetes/mobile native dan integrasi SPBE spesifik belum dideploy. Kebijakan PostgreSQL RLS telah ditulis, tetapi belum dapat divalidasi terhadap server PostgreSQL aktual pada lingkungan kerja ini.

## Kondisi source code sebelum pengembangan

| No. | Fitur proposal | Implementasi source code awal | Status awal | Gap utama |
|---:|---|---|---|---|
| 1 | IndoBERTweet AI-Routing | Pencocokan kata kunci di browser | Parsial/simulasi | Tidak ada model NLP, inference server, atau model artifact. |
| 2 | Klasifikasi multilabel dan confidence | Skor heuristik dari jumlah kata yang cocok | Parsial/simulasi | Bukan probabilitas model yang dikalibrasi; mudah dimanipulasi klien. |
| 3 | Human-in-the-loop <70% | Antrean demo di UI/dashboard | Parsial/simulasi | Belum ada antrean server persisten atau alur tinjauan backend. |
| 4 | Ekstraksi entitas dan routing OPD | Pemetaan kata kunci lokal | Parsial/simulasi | Tidak ada model entity extraction atau dispatcher server. |
| 5 | Nomor tiket unik | Dibuat JavaScript/local storage | Parsial | Tidak dijamin unik lintas browser/perangkat/server. |
| 6 | Audit trail | Riwayat lokal | Parsial | Tidak tersimpan terpusat dan dapat hilang saat data browser dihapus. |
| 7 | Notifikasi real-time dan SLA | Notifikasi browser dan waktu simulasi | Parsial/simulasi | Tidak ada worker server, scheduler, atau push. |
| 8 | Pelaporan anonim | Toggle anonim | Parsial | Belum ada jaminan alur server dan perlindungan metadata request. |
| 9 | ZKA dan E2EE | Enkripsi hanya bagian identitas/detail tertentu | Parsial/celah | Isi laporan utama dan lokasi masih plaintext di penyimpanan lokal. |
| 10 | PBKDF2-HMAC-SHA256 dan AES-256-GCM | Web Crypto API di browser | Parsial | Skema tidak mencakup keseluruhan payload dan distribusi kunci petugas. |
| 11 | Enkripsi payload dan lampiran | Identitas/detail/lampiran | Parsial | Deskripsi serta lokasi belum terenkripsi. |
| 12 | WCAG 2.1 AA | Zoom, kontras, font alternatif | Parsial | Belum ada audit kontras, reflow, atau pengujian assistive technology. |
| 13 | Voice-to-Text dan Voice Command | Web Speech API | Parsial | Bukan Whisper; coverage perintah terbatas dan tergantung browser. |
| 14 | Screen reader dan keyboard | Label, skip link, beberapa ARIA | Parsial | Belum ada audit WCAG formal dan pengujian screen reader. |
| 15 | Dashboard instansi dan analitik | Dashboard lokal | Parsial/simulasi | Tidak mengambil data backend/database. |
| 16 | PostgreSQL RLS | Filter array JavaScript | Belum | Tidak ada PostgreSQL/RLS. |
| 17 | JWT auth | Token dibuat/ditangani di browser | Belum aman | Secret berada di klien; bukan otorisasi server. |
| 18 | API Gateway/rate limit | Simulasi JavaScript | Belum | Tidak ada gateway server atau limiter terdistribusi. |
| 19 | REST/webhook/OpenAPI 3.1 | Contoh JSON dan fetch no-cors | Parsial/simulasi | Tidak ada backend API dan pengiriman webhook server. |
| 20 | SPBE/Smart City | Halaman konsep webhook | Belum | Belum ada integrasi server-ke-server yang nyata. |

## Status setelah pengembangan

| No. | Fitur proposal | Perubahan yang dibuat | Status saat ini | Batasan yang masih ada |
|---:|---|---|---|---|
| 1 | IndoBERTweet AI-Routing | Adapter triase lokal tetap ada dan diberi label demo; backend tidak mempercayai skor klien untuk auto-routing. | Belum terintegrasi | IndoBERTweet, fine-tuning, CNN/Bi-GRU, Focal Loss, inference service dan evaluasi model perlu disiapkan. |
| 2 | Multilabel/confidence | Struktur label multilabel dan skor saran disimpan sebagai metadata. | Parsial | Skor bukan confidence ML tervalidasi; backend menganggapnya saran tidak tepercaya. |
| 3 | Human-in-the-loop | Semua laporan baru masuk review queue hingga model tervalidasi; admin dapat verifikasi/rutekan. | Sudah sebagai workflow manual | Aturan otomatis threshold 70% baru dapat diaktifkan setelah output model server tervalidasi. |
| 4 | Entitas/routing OPD | Admin memilih OPD saat tinjauan; daftar OPD terpusat di klien/backend. | Parsial | Ekstraksi lokasi/entitas dan auto-dispatch berbasis model belum tersedia. |
| 5 | Nomor registrasi | ID tiket diterbitkan server, dengan 8 karakter acak tambahan dan unique constraint database. | Sudah | Collision ditangani dengan respons retry; tidak ada reservasi ID terdistribusi khusus. |
| 6 | Audit trail | Event dibuat backend dan disimpan di tabel `report_events`; public tracker membaca riwayat. | Sudah | Immutable terhadap API biasa; admin database tetap memiliki akses administratif. |
| 7 | Notifikasi/SLA | Worker backend menandai breach, menulis event, dan mengirim webhook; browser polling 20 detik dan notifikasi browser. | Parsial | Bukan WebSocket/FCM/APNs; SLA scheduler perlu monitoring/queue terkoordinasi pada skala multi-replica. |
| 8 | Anonim | Browser mengirim `identity: null` dalam payload terenkripsi; server hanya menyimpan flag anonim dan ciphertext. | Sudah dengan batasan | Reverse proxy/WAF dapat mencatat IP; minimisasi log, kebijakan retensi, dan proses legal tetap wajib. |
| 9 | ZKA/E2EE | Payload sensitif dienkripsi di browser; server tidak memiliki private key atau kata sandi brankas. | Parsial-kuat | Metadata operasional (tenant, label, confidence saran, status, SLA, waktu, flag anonim) tetap terbaca server. Perlu threat model dan audit kripto independen. |
| 10 | PBKDF2/AES | PBKDF2-HMAC-SHA256 310.000 iterasi; AES-256-GCM; DEK acak dibungkus untuk pemilik dan RSA-OAEP instansi. | Sudah pada prototipe | Pemulihan/rotasi kunci, backup offline, dan audit implementasi kripto formal belum tersedia. |
| 11 | Payload/lampiran | Deskripsi, lokasi, identitas, detail sensitif, dan lampiran masuk ciphertext AES-GCM. | Sudah pada alur browser | Server tidak dapat melakukan malware scanning pada file terenkripsi; perlu kontrol file scanning yang menjaga model privasi. |
| 12 | WCAG 2.1 AA | Mode kontras, zoom 100–200%, font alternatif, layout responsif, focus visible. | Parsial | Belum diaudit untuk seluruh kriteria WCAG 2.1 AA. |
| 13 | ASR | Dikte dan voice command melalui Web Speech API browser; perintah navigasi, tulis, anonim, zoom, kontras, kirim, dan lacak tersedia. | Parsial | Whisper Large v3 belum dipasang; dukungan, akurasi, dan privasi audio tergantung browser. |
| 14 | Screen reader/keyboard | Semantik HTML, label, skip link, heading, live region, fokus keyboard, form errors. | Parsial | Perlu pengujian NVDA/JAWS/VoiceOver/TalkBack dan audit WCAG formal. |
| 15 | Dashboard/analitik | Statistik status, distribusi OPD, review queue, SLA, detail ciphertext, dekripsi di browser. | Sudah | KPI operasional masih dasar; belum ada BI/time-series atau pelaporan lintas wilayah teragregasi. |
| 16 | PostgreSQL RLS | Policy `ENABLE/FORCE RLS` pada reports/events/webhooks dan tenant/OPD context via `SET LOCAL`. | Diimplementasikan, belum diuji pada PostgreSQL | SQLite test tidak menguji RLS; Docker/PostgreSQL tidak tersedia di lingkungan ini. Harus diuji pada DB target sebelum data riil. |
| 17 | JWT/auth | JWT HS256 server-side, expiry, issuer/audience, password scrypt, verifikasi scope token terhadap DB, create account admin-only, bootstrap administrator via CLI, dan password change yang mencabut token lama. | Sudah untuk prototipe backend | Belum ada MFA, rotasi kunci penandatangan JWT terencana, pemulihan password, dan kebijakan SSO instansi. |
| 18 | API Gateway | Rate limiter API proses tunggal dan contoh konfigurasi KrakenD. | Parsial | KrakenD tidak disertakan dalam Compose default; limiter terdistribusi harus pindah ke KrakenD/Redis. |
| 19 | REST/webhook/OpenAPI | FastAPI expose OpenAPI 3.1.0, Swagger UI, HTTPS webhook HMAC, API stats/export. | Sudah sebagai API backend | Belum ada retry queue, dead-letter, consumer verification library, dan versioning policy formal. |
| 20 | SPBE/Smart City | Webhook tenant-level dan OpenAPI menjadi titik integrasi. | Parsial | Konektor SP4N-LAPOR/SPBE/Smart City tiap daerah, kontrak data, sertifikasi, dan persetujuan instansi belum tersedia. |

## Perubahan arsitektur utama

- Browser menyusun payload laporan dan mengenkripsi seluruh konten sensitif menggunakan AES-256-GCM sebelum request dikirim.
- Kata sandi pelapor membungkus data encryption key (DEK) melalui PBKDF2-HMAC-SHA256. Salinan DEK lain dibungkus dengan kunci publik RSA-OAEP instansi supaya petugas yang memegang private key instansi dapat mendekripsi di browser.
- Private key instansi sendiri hanya disimpan dalam bentuk AES-GCM envelope yang dilindungi kata sandi brankas administrator.
- Backend menyimpan ciphertext, envelope, tenant, label saran, flag anonim, status, tenggat SLA, dan audit event. Backend tidak menyediakan endpoint dekripsi.
- Dashboard memakai JWT yang diterbitkan backend dan pembatasan tenant/OPD. PostgreSQL RLS menjadi pertahanan tambahan, bukan pengganti otorisasi API.
- SQLite hanya mode development/test. Deployment yang ditujukan untuk penggunaan publik harus menggunakan PostgreSQL, secret produksi, TLS, reverse proxy, backup, observability, dan pengujian RLS.

## File hasil

- `frontend/index.html`, `frontend/style.css`, `frontend/script.js`, `frontend/crypto.js`: client web responsif, aksesibilitas, API client, E2EE.
- `backend/app/main.py`: endpoint FastAPI, auth, review/routing, SLA, webhook, serving frontend.
- `backend/app/models.py`, `schemas.py`, `security.py`, `database.py`: model SQL, validasi request, JWT/password/server-secret, koneksi dan RLS.
- `backend/postgres/init-role.sh`: pembuatan role runtime PostgreSQL non-superuser.
- `backend/gateway/krakend.json`: konfigurasi gateway contoh; belum dideploy oleh Compose.
- `docker-compose.yml`, `backend/Dockerfile`, `.env.example`: deployment lokal.
- `tests/`: pengujian API dan smoke test E2EE.
- `legacy-source/`: salinan file original yang diberikan agar baseline tidak hilang.

## Batas interpretasi

Status “Sudah” berarti alur tersebut diimplementasikan pada kode proyek ini, bukan berarti sudah lulus audit keamanan, compliance, load test, audit WCAG formal, atau deployment produksi. Tidak ada klaim bahwa IndoBERTweet, Whisper, KrakenD, Kubernetes, native mobile, atau konektor SPBE telah aktif.
