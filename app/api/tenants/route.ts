// Resource: tenants (booth)
//   GET  /api/tenants   admin: semua tenant, pemilik tenant: miliknya saja
//   POST /api/tenants   tambah tenant { id, name, location, limitA, ownerId } -> 201 (admin)
import { sql, logEvent } from "@/lib/db";
import { config, MAX_LIMIT_A } from "@/lib/config";
import { requireAdmin, requireUser } from "@/lib/auth";
import { created, fail, ok, readJson } from "@/lib/http";
import { getTenant, listTenants } from "@/lib/tenants";

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return ok(await listTenants(user));
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const b = await readJson(req);
  const id = String(b.id ?? "").trim().toUpperCase();
  const name = String(b.name ?? "").trim();
  const limitA = Number(b.limitA ?? config.defaultLimitA);
  const ownerId = b.ownerId ? Number(b.ownerId) : null;

  if (!/^[A-Z0-9_-]{3,32}$/.test(id)) return fail(400, "Device ID 3–32 karakter: huruf, angka, - atau _ (contoh ESP32-002)");
  if (!name) return fail(400, "Nama tenant wajib diisi");
  if (!(limitA > 0 && limitA <= MAX_LIMIT_A)) return fail(400, `Alokasi arus harus antara 0 dan ${MAX_LIMIT_A} A`);
  const [exists] = await sql`SELECT 1 FROM tenants WHERE id = ${id}`;
  if (exists) return fail(409, `Device ID ${id} sudah terdaftar`);
  if (ownerId) {
    const [owner] = await sql`SELECT 1 FROM users WHERE id = ${ownerId}`;
    if (!owner) return fail(400, "Akun pemilik tidak ditemukan");
  }

  await sql`INSERT INTO tenants (id, name, location, limit_a, owner_id)
            VALUES (${id}, ${name}, ${String(b.location ?? "").trim()}, ${limitA}, ${ownerId})`;
  await logEvent(id, "TENANT_ADDED", `Tenant ${name} ditambahkan oleh ${admin.name}`);
  return created(await getTenant(admin, id));
}
