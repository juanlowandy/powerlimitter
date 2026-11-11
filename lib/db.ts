// Koneksi ke PostgreSQL (Neon/Supabase/lokal) memakai library `postgres`.
// Query ditulis dengan tagged template:  await sql`SELECT * FROM tenants WHERE id = ${id}`
// Nilai ${...} otomatis dikirim sebagai parameter, jadi aman dari SQL injection.
import postgres from "postgres";
import { config } from "./config";

function connect() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL belum diisi. Lihat README bagian Setup Database.");
  }
  return postgres(config.databaseUrl, {
    prepare: false,   // wajib untuk connection pooler (Neon/Supabase)
    max: 5,
    idle_timeout: 20,
    // BIGINT (id BIGSERIAL, COUNT) dikembalikan sebagai number biasa, bukan string
    types: {
      int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
}

// Simpan koneksi di globalThis supaya tidak dibuat ulang setiap hot reload / request.
// Koneksi baru dibuat saat query pertama, jadi `npm run build` tetap jalan tanpa DATABASE_URL.
const g = globalThis as unknown as { __sql?: postgres.Sql };
const getSql = () => g.__sql ?? (g.__sql = connect());

export const sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  apply: (_target, thisArg, args) => Reflect.apply(getSql() as unknown as (...a: unknown[]) => unknown, thisArg, args),
  get: (_target, prop) => {
    const real = getSql() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function logEvent(tenantId: string, type: string, message: string) {
  await sql`INSERT INTO events (tenant_id, type, message) VALUES (${tenantId}, ${type}, ${message})`;
}
