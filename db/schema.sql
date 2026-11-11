-- =====================================================================
-- Skema database Smart Power (PostgreSQL)
-- Dijalankan oleh: npm run db:setup
-- Aman dijalankan berulang kali. Database versi lama (batas dalam watt)
-- otomatis diperbarui ke versi ampere + 2 colokan, tanpa menghapus data.
-- =====================================================================

-- Akun login.
--   admin  = pengelola bazar (mengatur semua tenant)
--   tenant = pemilik booth (memantau booth miliknya, menyalakan colokan 1)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,                 -- hash scrypt, bukan password asli
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'tenant')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));

-- Satu tenant = satu booth = satu ESP32 + satu INA219 (arus total) + relay 2 channel.
-- id sama dengan DEVICE_ID di firmware.
CREATE TABLE IF NOT EXISTS tenants (
  id                TEXT PRIMARY KEY,              -- contoh: ESP32-001
  name              TEXT NOT NULL,
  location          TEXT NOT NULL DEFAULT '',
  limit_a           DOUBLE PRECISION NOT NULL DEFAULT 2 CHECK (limit_a > 0),  -- alokasi arus (ampere)
  outlet1_command   TEXT NOT NULL DEFAULT 'ON'  CHECK (outlet1_command IN ('ON', 'OFF')),  -- perintah colokan 1
  outlet2_command   TEXT NOT NULL DEFAULT 'OFF' CHECK (outlet2_command IN ('ON', 'OFF')),  -- perintah colokan 2 (butuh izin admin)
  outlet1_state     TEXT CHECK (outlet1_state IN ('ON', 'OFF')),   -- laporan terakhir dari ESP32
  outlet2_state     TEXT CHECK (outlet2_state IN ('ON', 'OFF')),
  tripped           BOOLEAN NOT NULL DEFAULT false,  -- diputus karena melebihi alokasi
  warning           BOOLEAN NOT NULL DEFAULT false,  -- arus >= 80% alokasi
  outlet2_requested BOOLEAN NOT NULL DEFAULT false,  -- tenant minta izin menyalakan colokan 2
  alloc_requested   BOOLEAN NOT NULL DEFAULT false,  -- tenant minta tambah alokasi arus
  owner_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_seen         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Setiap pembacaan sensor INA219 (arus total kedua colokan)
CREATE TABLE IF NOT EXISTS readings (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  voltage_v  DOUBLE PRECISION NOT NULL,
  current_a  DOUBLE PRECISION NOT NULL,
  power_w    DOUBLE PRECISION NOT NULL,                -- disimpan untuk keperluan lanjutan, tidak ditampilkan
  dt_s       DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS readings_tenant_ts_idx ON readings (tenant_id, ts DESC);

-- Log kejadian penting per tenant
CREATE TABLE IF NOT EXISTS events (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  type       TEXT NOT NULL,
  message    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_tenant_ts_idx ON events (tenant_id, ts DESC);

-- ---------------------------------------------------------------------
-- Pembaruan dari versi lama (batas watt + 1 relay) ke versi ampere + 2 colokan
-- ---------------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS limit_a           DOUBLE PRECISION NOT NULL DEFAULT 2 CHECK (limit_a > 0);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS outlet1_command   TEXT NOT NULL DEFAULT 'ON'  CHECK (outlet1_command IN ('ON', 'OFF'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS outlet2_command   TEXT NOT NULL DEFAULT 'OFF' CHECK (outlet2_command IN ('ON', 'OFF'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS outlet1_state     TEXT CHECK (outlet1_state IN ('ON', 'OFF'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS outlet2_state     TEXT CHECK (outlet2_state IN ('ON', 'OFF'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS warning           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS outlet2_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS alloc_requested   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants DROP COLUMN IF EXISTS limit_w;
ALTER TABLE tenants DROP COLUMN IF EXISTS relay_command;
ALTER TABLE tenants DROP COLUMN IF EXISTS relay_state;

-- Jenis kejadian (yang lama tetap diizinkan supaya data lama tidak ditolak)
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE events ADD CONSTRAINT events_type_check CHECK (type IN (
  'TENANT_ADDED',
  'WARNING',            -- arus mendekati alokasi (>= 80%)
  'TRIP',               -- arus melebihi alokasi, kedua colokan diputus
  'OUTLET_ON', 'OUTLET_OFF',
  'OUTLET2_REQUESTED', 'OUTLET2_APPROVED',
  'ALLOC_REQUESTED', 'ALLOC_INCREASED',
  'REQUEST_REJECTED',
  'LIMIT_CHANGED',
  'RELAY_ON', 'RELAY_OFF'   -- versi lama
));
