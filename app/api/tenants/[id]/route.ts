// Resource: satu tenant
//   GET    /api/tenants/:id
//   PATCH  /api/tenants/:id   ubah sebagian { name?, location?, limitA?, ownerId? } (admin)
//   DELETE /api/tenants/:id   hapus tenant beserta seluruh datanya -> 204 (admin)
import { sql, logEvent } from "@/lib/db";
import { MAX_LIMIT_A } from "@/lib/config";
import { requireAdmin, requireUser } from "@/lib/auth";
import { fail, noContent, ok, readJson } from "@/lib/http";
import { amp, findTenantFor, getTenant } from "@/lib/tenants";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const t = await getTenant(user, (await params).id);
  return t ? ok(t) : fail(404, "Tenant tidak ditemukan");
}

export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const t = await findTenantFor(admin, (await params).id);
  if (!t) return fail(404, "Tenant tidak ditemukan");

  const b = await readJson(req);
  const name = b.name !== undefined ? String(b.name).trim() : t.name;
  const location = b.location !== undefined ? String(b.location).trim() : t.location;
  const limitA = b.limitA !== undefined ? Number(b.limitA) : t.limit_a;
  const ownerId = b.ownerId !== undefined ? (b.ownerId ? Number(b.ownerId) : null) : t.owner_id;

  if (!name) return fail(400, "Nama tenant wajib diisi");
  if (!(limitA > 0 && limitA <= MAX_LIMIT_A)) return fail(400, `Alokasi arus harus antara 0 dan ${MAX_LIMIT_A} A`);
  if (ownerId) {
    const [owner] = await sql`SELECT 1 FROM users WHERE id = ${ownerId}`;
    if (!owner) return fail(400, "Akun pemilik tidak ditemukan");
  }

  // Menaikkan alokasi sekaligus menjawab permintaan tambah arus dari tenant
  const increased = limitA > t.limit_a;
  await sql`UPDATE tenants SET name = ${name}, location = ${location}, limit_a = ${limitA}, owner_id = ${ownerId},
              alloc_requested = ${increased ? false : t.alloc_requested}
            WHERE id = ${t.id}`;
  if (increased) {
    await logEvent(t.id, "ALLOC_INCREASED", `Alokasi arus dinaikkan dari ${amp(t.limit_a)} ke ${amp(limitA)} oleh ${admin.name}`);
  } else if (limitA !== t.limit_a) {
    await logEvent(t.id, "LIMIT_CHANGED", `Alokasi arus diubah dari ${amp(t.limit_a)} ke ${amp(limitA)} oleh ${admin.name}`);
  }
  return ok(await getTenant(admin, t.id));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const t = await findTenantFor(admin, (await params).id);
  if (!t) return fail(404, "Tenant tidak ditemukan");
  await sql`DELETE FROM tenants WHERE id = ${t.id}`;
  return noContent();
}
