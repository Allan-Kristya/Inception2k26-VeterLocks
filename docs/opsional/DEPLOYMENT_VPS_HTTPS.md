# Deployment singkat LaporAman (VPS + HTTPS)

Panduan ini untuk demo bersama juri. Gunakan data dummy saja. Sebelum menerima laporan masyarakat sungguhan, lakukan hardening dan audit keamanan/legal.

## 1. Siapkan VPS dan DNS

- Ubuntu LTS, disarankan 2–4 vCPU dan RAM 4–8 GB.
- Domain/subdomain diarahkan dengan DNS A record ke IP VPS.
- Firewall hanya membuka SSH, HTTP (80), dan HTTPS (443). Jangan membuka port PostgreSQL 5432.

## 2. Siapkan source dan secrets

Clone/copy project ke `/opt/laporaman`, lalu:

```bash
cd /opt/laporaman
cp .env.example .env
chmod 600 .env
```

Isi `.env` dengan secret acak yang kuat. Contoh membuat nilai acak:

```bash
openssl rand -hex 32
```

Gunakan nilai berbeda untuk `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_APP_PASSWORD`, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, dan `BOOTSTRAP_PASSWORD`. Pastikan password PostgreSQL aman untuk URL koneksi (gunakan karakter hex/URL-safe). Atur:

```dotenv
APP_ENV=production
SEED_DEMO_USERS=false
LOG_LEVEL=INFO
```

Jangan commit atau membagikan `.env`. Jangan gunakan nilai contoh/default.

## 3. Jalankan database dan API

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 api
curl http://127.0.0.1:8000/api/health
```

Port API di Compose diikat ke `127.0.0.1` agar akses publik hanya melalui reverse proxy HTTPS. Health check normal harus menunjukkan `status: ok` dan `database_status: connected`.

Buat administrator pertama (perintah meminta password secara interaktif):

```bash
docker compose exec api python -m app.cli create-admin --email admin@demo.go.id --name "Administrator Demo" --tenant sby
```

Pastikan akun operator demo dibuat melalui dashboard setelah administrator login. Jangan gunakan akun `@laporaman.local` atau seed demo di deployment publik.

## 4. Pasang reverse proxy HTTPS

Pasang Caddy sesuai dokumentasi resminya. Buat `/etc/caddy/Caddyfile` (ganti domain):

```caddy
laporaman.domain-anda.id {
    encode gzip zstd
    reverse_proxy 127.0.0.1:8000
}
```

Reload Caddy dan pastikan DNS serta port 80/443 dapat dijangkau. Caddy akan mengurus sertifikat TLS otomatis jika prasyarat DNS/network terpenuhi.

## 5. Smoke test setelah deployment

- Buka `https://laporaman.domain-anda.id`.
- Buka `https://laporaman.domain-anda.id/api/health`.
- Login admin, buat kunci tenant, lalu kirim laporan dummy.
- Lacak tiket, proses laporan dari dashboard, dan cek status terbaru.
- Restart API (`docker compose restart api`) lalu pastikan tiket masih ada.
- Uji akun lintas OPD/tenant. Jangan menganggap RLS tervalidasi hanya karena aplikasi berjalan; jalankan pengujian RLS khusus terhadap PostgreSQL aktual sebelum demo jika waktu memungkinkan.

## 6. Backup minimal

```bash
mkdir -p /var/backups/laporaman
docker compose exec -T db pg_dump -U laporaman_admin -d laporaman -Fc > /var/backups/laporaman/backup-$(date +%F-%H%M).dump
```

Backup berisi data sensitif. Enkripsi dan simpan di lokasi aman/offsite, batasi permission, dan lakukan uji restore. Jangan memasukkan dump database atau private key ke ZIP yang dibagikan.

## Catatan keamanan

- `docker compose down` mempertahankan volume database; **jangan** gunakan `docker compose down -v` jika data harus dipertahankan.
- Gunakan hanya data dummy untuk hackathon.
- Demo akun, kredensial, private key, backup database, dan `.env` tidak boleh dimasukkan ke ZIP rilis.
- RLS PostgreSQL sudah dikonfigurasi di kode, tetapi harus diuji pada instance PostgreSQL deployment nyata.
