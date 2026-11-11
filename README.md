# Smart Power: Smart Limiter per Booth

Website monitoring dan pembatasan daya untuk tenant bazar (CE631 / CE739L).

| Bagian | Teknologi |
|---|---|
| Frontend | Next.js 16 (React, TypeScript), CSS biasa |
| Backend | Next.js Route Handlers (`app/api/`), berjalan sebagai Vercel Functions |
| Database | PostgreSQL di **Neon** (online), diakses dengan library `postgres` |
| Hosting | **Vercel** (region Singapura) |
| Perangkat | ESP32 + INA219 (arus total) + relay 2 channel (2 colokan), mengirim data lewat HTTPS |

```
ESP32 + INA219 ──HTTPS POST──▶ Vercel (Next.js API) ──SQL──▶ Neon PostgreSQL
      ▲                               ▲
      └── perintah relay + batas      └── browser admin / pemilik tenant
```

## Susunan folder

```
web-nextjs/
├── app/
│   ├── login/page.tsx            Halaman login
│   ├── (dashboard)/              Halaman setelah login (tidak muncul di URL)
│   │   ├── page.tsx              /          Overview
│   │   ├── riwayat/page.tsx      /riwayat   Energi per jam/hari, CSV, log
│   │   ├── tenant/page.tsx       /tenant    Kelola tenant (admin)
│   │   └── akun/page.tsx         /akun      Kelola akun (admin)
│   └── api/                      BACKEND (lihat Daftar API)
├── components/                   Potongan tampilan
├── lib/                          Koneksi database, login, tipe data, format
├── db/schema.sql                 Struktur tabel database
├── scripts/setup-db.mjs          Membuat tabel + akun admin  (npm run db:setup)
├── scripts/simulate-esp32.mjs    Simulator ESP32             (npm run simulate)
├── esp32/SmartPowerESP32/        Firmware Arduino
└── api-test.http                 Contoh request untuk demo API (VS Code REST Client)
```

---

## 1. Buat database di Neon (sekali saja)

1. Daftar di https://neon.com (bisa login dengan GitHub), lalu klik **New Project**.
2. Isi nama `smartpower`, pilih region **AWS Asia Pacific (Singapore)**, Postgres versi terbaru.
3. Di halaman project, klik **Connect**. Aktifkan **Connection pooling**, lalu salin connection string-nya
   (diawali `postgresql://` dan mengandung `-pooler`).
4. Supaya kuota gratis tidak cepat habis: buka **Branches → main → compute → Edit**, lalu set ukuran
   compute ke **0.25 CU** dan biarkan *scale to zero* aktif.

## 2. Jalankan di laptop

```bash
copy .env.example .env.local        # Mac/Linux: cp .env.example .env.local
```

Buka `.env.local` lalu isi:
- `DATABASE_URL`: connection string dari Neon.
- `AUTH_SECRET`: teks acak, buat dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `DEVICE_KEY`: kata kunci bebas untuk ESP32, misalnya `bazar-esp32-2026`.

Lalu jalankan:

```bash
npm install
npm run db:setup     # membuat tabel + akun admin + Tenant 1 di Neon
npm run dev
```

Buka http://localhost:3000 dan login dengan **admin / admin123**.

Karena database-nya di Neon, data yang dibuat dari laptop mana pun (dan nanti dari Vercel) **sama**.
Semua anggota kelompok cukup memakai `DATABASE_URL` yang sama di `.env.local` masing-masing.

Tes tanpa ESP32 (terminal kedua):
```bash
npm run simulate -- --key bazar-esp32-2026
```

## 3. Deploy ke Vercel

1. Upload project ke GitHub. File `.env.local` **tidak** ikut ter-upload (sudah ada di `.gitignore`),
   dan memang tidak boleh ikut.
2. Buka https://vercel.com, login dengan GitHub, klik **Add New → Project**, lalu pilih repository-nya.
3. Di bagian **Environment Variables**, isi `DATABASE_URL`, `AUTH_SECRET`, dan `DEVICE_KEY`
   dengan nilai yang sama seperti di `.env.local`. `REPORT_INTERVAL_MS` boleh dikosongkan.
4. Klik **Deploy**. Setelah selesai, website bisa dibuka di `https://nama-project.vercel.app`.

Setiap kali ada `git push` ke GitHub, Vercel otomatis deploy ulang.

## 4. Hubungkan ESP32

1. Install library **Adafruit INA219** dan **ArduinoJson (v7)** di Arduino IDE, board **DOIT ESP32 DEVKIT V1**.
2. Di `esp32/SmartPowerESP32/SmartPowerESP32.ino`, ubah:
   - `WIFI_SSID`, `WIFI_PASSWORD` (Wi-Fi 2.4 GHz)
   - `SERVER_URL`: `http://IP-LAPTOP:3000` (lokal) atau `https://nama-project.vercel.app`
   - `DEVICE_ID`: harus sudah ditambahkan di menu **Kelola Tenant**
   - `DEVICE_KEY`: sama dengan `DEVICE_KEY` di `.env.local` / Vercel
   - `OUTLET_PIN` (default GPIO26 = colokan 1, GPIO27 = colokan 2) dan `RELAY_ACTIVE_LOW`
3. Upload, lalu buka Serial Monitor (115200).

Rangkaian (satu INA219 mengukur **arus total** kedua colokan):

```
Sumber DC (+) -> INA219 VIN+ -> VIN- -> Relay 1 (COM-NO) -> Colokan 1
                                     -> Relay 2 (COM-NO) -> Colokan 2
INA219: SDA -> GPIO21, SCL -> GPIO22, VCC -> 3V3      Relay: IN1 -> GPIO26, IN2 -> GPIO27, VCC -> VIN
GND sumber, INA219, relay, dan ESP32 wajib disatukan.
```

Untuk beban di atas 2 A, pakai jalur 12 V langsung (bukan lewat buck), kabel minimal 0,5 mm², dan fuse 3 A.
INA219 harus memakai kalibrasi default (sampai ±3,2 A).

## 5. Aturan alokasi arus dan 2 colokan

- Setiap tenant punya **alokasi arus** (default **2 A**) untuk total kedua colokan. Maksimal yang bisa diatur 3 A.
- **Colokan 1** boleh dinyalakan dan dimatikan sendiri oleh pemilik tenant.
- **Colokan 2** butuh **izin pengelola**: pemilik tenant menekan *Minta izin*, lalu admin menekan *Setujui & nyalakan*
  atau *Tolak*. Pemilik tenant tetap boleh mematikan colokan 2.
- Saat arus **≥ 80% alokasi** (misalnya 1,6 A dari 2 A), muncul peringatan **Mendekati batas** dan tenant bisa menekan
  *Minta tambah arus*. Peringatan hilang setelah arus turun di bawah 70%.
- Saat arus **melebihi alokasi 3 kali berturut-turut** (±1,5 detik), ESP32 langsung memutus **kedua colokan**.
  Hanya admin yang bisa menyambungkan ulang, dengan dua pilihan: *Naikkan alokasi & sambungkan*, atau
  *Sambungkan tanpa menambah*. Colokan 2 tetap mati sampai diizinkan lagi.
- Semua kejadian (peringatan, over-limit, permintaan, persetujuan, perubahan alokasi) tercatat di tabel `events`.

Simulator: `npm run simulate -- --key <DEVICE_KEY>`. Beban simulasi colokan 1 ±1,1 A dan colokan 2 ±0,6 A,
dan setiap 2 menit ada alat tambahan +0,6 A selama 20 detik sehingga total melewati 2 A.

---

## Daftar API

### Resource

| Resource | URL | Keterangan |
|---|---|---|
| Session | `/api/session` | Sesi login |
| User | `/api/users`, `/api/users/:id` | Akun admin & pemilik tenant |
| Tenant | `/api/tenants`, `/api/tenants/:id` | Booth (id = Device ID ESP32) dengan alokasi arus |
| Outlet | `/api/tenants/:id/outlets`, `/api/tenants/:id/outlets/:no` | Colokan 1 dan 2 sebuah tenant |
| Request | `/api/tenants/:id/requests`, `/api/tenants/:id/requests/:type` | Permintaan tenant: izin colokan 2, tambah arus |
| Reading | `/api/tenants/:id/readings` | Pembacaan sensor (arus total) sebuah tenant |
| Usage | `/api/tenants/:id/usage` | Ringkasan arus per interval + jumlah over-limit (hanya baca) |
| Event | `/api/tenants/:id/events` | Log kejadian (hanya baca) |

### Konvensi

- **HTTP method ↔ operasi:** `GET` baca, `POST` buat baru, `PATCH` ubah sebagian, `PUT` ganti seluruh nilai, `DELETE` hapus.
- **URL:** kata benda jamak (`/tenants`), id di path (`/tenants/ESP32-001`), data milik tenant
  sebagai sub-resource (`/tenants/ESP32-001/outlets/2`), filter di query string (`?from=&to=`).
- **JSON:** nama field `camelCase`, waktu ISO 8601 UTC (`2026-10-20T08:00:00Z`), satuan V / A.
- **Status code:** `200` OK, `201` dibuat, `204` dihapus (tanpa isi), `400` input salah, `401` belum login /
  kunci device salah, `403` tidak berwenang, `404` tidak ditemukan atau bukan miliknya, `409` konflik
  (duplikat, permintaan sudah ada, atau colokan diputus karena over-limit).
- **Error:** selalu berbentuk `{ "error": "pesan" }`.
- **Autentikasi:** website memakai cookie sesi, ESP32 memakai header `X-Device-Key`.

### Endpoint

| Method | URL | Siapa | Body / Query | Respons |
|---|---|---|---|---|
| POST | `/api/session` | Semua | `{ username, password }` | 201 akun |
| GET | `/api/session` | Login | | 200 akun |
| DELETE | `/api/session` | Login | | 204 |
| GET | `/api/users` | Admin | | 200 daftar akun |
| POST | `/api/users` | Admin | `{ username, password, name, role }` | 201 akun |
| GET | `/api/users/:id` | Admin | | 200 akun |
| PATCH | `/api/users/:id` | Admin | `{ name?, username?, role?, password? }` | 200 akun |
| DELETE | `/api/users/:id` | Admin | | 204 |
| GET | `/api/tenants` | Login | | 200 daftar tenant* |
| POST | `/api/tenants` | Admin | `{ id, name, location?, limitA, ownerId? }` | 201 tenant |
| GET | `/api/tenants/:id` | Login | | 200 tenant* |
| PATCH | `/api/tenants/:id` | Admin | `{ name?, location?, limitA?, ownerId? }` | 200 tenant |
| DELETE | `/api/tenants/:id` | Admin | | 204 |
| GET | `/api/tenants/:id/outlets` | Login | | 200 `[{ no, command, state }, …]` |
| GET | `/api/tenants/:id/outlets/:no` | Login | | 200 `{ no, command, state }` |
| PUT | `/api/tenants/:id/outlets/:no` | Admin; pemilik: colokan 1, atau OFF | `{ command: "ON" \| "OFF" }` | 200 colokan |
| GET | `/api/tenants/:id/requests` | Login | | 200 `{ outlet2, allocation }` |
| POST | `/api/tenants/:id/requests` | Login | `{ type: "outlet2" \| "allocation" }` | 201 |
| DELETE | `/api/tenants/:id/requests/:type` | Admin (tolak), pemilik (batal) | | 204 |
| GET | `/api/tenants/:id/readings` | Login | `?from&to&limit` | 200 daftar pembacaan |
| POST | `/api/tenants/:id/readings` | ESP32 | `{ voltage, current, outlet1, outlet2, tripped, tripCurrent? }` | 201 `{ reading, command }` |
| GET | `/api/tenants/:id/usage` | Login | `?from&to&bucket(detik)&tz` | 200 `{ points, totals }` |
| GET | `/api/tenants/:id/events` | Login | `?limit` | 200 daftar kejadian |

\* Pemilik tenant hanya mendapat tenant miliknya.

**Catatan "half-REST":** `POST /readings` sekaligus mengembalikan `command` (perintah kedua colokan & alokasi
terbaru), supaya ESP32 cukup satu request per laporan.

Untuk demo API, buka `api-test.http` di VS Code (extension **REST Client**) atau impor ke Postman.

## Database

Struktur lengkap ada di `db/schema.sql`. `npm run db:setup` juga memperbarui database versi lama
(batas watt) ke versi ampere + 2 colokan tanpa menghapus data; alokasi semua tenant menjadi 2 A.

| Tabel | Isi | Relasi |
|---|---|---|
| `users` | Akun, password di-hash (scrypt), peran `admin`/`tenant` | |
| `tenants` | Booth: alokasi arus, perintah & status kedua colokan, status over-limit dan peringatan, permintaan tenant | `owner_id → users` (SET NULL) |
| `readings` | Setiap pembacaan sensor (V, arus total) | `tenant_id → tenants` (CASCADE) |
| `events` | Log peringatan, over-limit, colokan, permintaan, perubahan alokasi | `tenant_id → tenants` (CASCADE) |

Untuk membuka database saat demo: Neon Console → **Tables** atau **SQL Editor**
(misalnya `SELECT * FROM events ORDER BY ts DESC LIMIT 20;`).

## Kuota gratis yang perlu diperhatikan

- **Vercel Hobby:** setiap request ke API dihitung sebagai satu *function invocation*, dengan jatah bulanan
  terbatas. Karena itu ESP32 melapor tiap 10 detik (bukan tiap detik), dan website berhenti polling saat
  tab tidak dibuka.
- **Neon Free:** compute dihitung per jam aktif dan akan tidur kalau tidak ada request selama 5 menit.
  ESP32 dan simulator yang menyala 24 jam membuat database tidak pernah tidur, jadi matikan saat tidak
  sedang dipakai.
- **Penyimpanan:** satu tenant yang melapor tiap 10 detik menghasilkan sekitar 8.600 baris per hari.
  Itu masih sangat kecil untuk kuota penyimpanan Neon Free.

## Masalah yang sering muncul

| Gejala | Penyebab |
|---|---|
| `DATABASE_URL belum diisi` | `.env.local` belum dibuat, atau Environment Variables di Vercel belum diisi |
| ESP32: `HTTP 401` | `DEVICE_KEY` di firmware berbeda dengan di server |
| ESP32: `HTTP 404` | Device ID belum ditambahkan di Kelola Tenant |
| ESP32: `HTTP 503` | `DEVICE_KEY` belum diisi di Vercel |
| ESP32: `HTTP -1` | Wi-Fi bukan 2.4 GHz, atau `SERVER_URL` salah |
| Login di Vercel tidak bisa | `AUTH_SECRET` belum diisi di Vercel (lalu Redeploy) |
