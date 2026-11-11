// Pengaturan dari environment variable (.env.local saat lokal, Environment Variables di Vercel).

const isProd = process.env.NODE_ENV === "production";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  authSecret: process.env.AUTH_SECRET || (isProd ? "" : "dev-secret-ganti-di-produksi"),
  // Kunci rahasia ESP32. Wajib diisi saat sudah online, supaya orang lain tidak bisa mengirim data palsu.
  deviceKey: process.env.DEVICE_KEY ?? "",
  isProd,
  // Seberapa sering ESP32 mengirim data ke server (ms). Proteksi over-limit di ESP32 tetap tiap 500 ms.
  reportIntervalMs: Number(process.env.REPORT_INTERVAL_MS || 10_000),
  defaultLimitA: Number(process.env.DEFAULT_LIMIT_A || 2),
};

// ESP32 dianggap offline kalau tidak mengirim data selama 3x interval
export const OFFLINE_AFTER_MS = config.reportIntervalMs * 3;


// Peringatan 80% / hilang di bawah 70%, dan alokasi maksimum 3 A
export { MAX_LIMIT_A, WARN_CLEAR_RATIO, WARN_RATIO } from "./limits";
