// Resource: satu akun — khusus admin
//   GET    /api/users/:id
//   PATCH  /api/users/:id   ubah sebagian { name?, username?, role?, password? }
//   DELETE /api/users/:id   -> 204 (booth miliknya tetap ada, hanya tanpa pemilik)
import { sql } from "@/lib/db";
import { requireAdmin, type UserRow } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { fail, noContent, ok, readJson } from "@/lib/http";
import { validateUser, withTenants } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

async function findUser(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return null;
  const [u] = await sql<UserRow[]>`SELECT * FROM users WHERE id = ${id}`;
  return u ?? null;
}

async function adminCount() {
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`;
  return n;
}

export async function GET(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const u = await findUser(ctx);
  return u ? ok(await withTenants(u)) : fail(404, "Akun tidak ditemukan");
}

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const u = await findUser(ctx);
  if (!u) return fail(404, "Akun tidak ditemukan");

  const b = await readJson(req);
  const error = validateUser(b, false);
  if (error) return fail(400, error);
  if (b.role === "tenant" && u.role === "admin" && (await adminCount()) <= 1) return fail(400, "Harus ada minimal satu admin");
  if (b.username && String(b.username).toLowerCase() !== u.username.toLowerCase()) {
    const [taken] = await sql`SELECT 1 FROM users WHERE lower(username) = lower(${String(b.username)})`;
    if (taken) return fail(409, `Username ${b.username} sudah dipakai`);
  }

  const [updated] = await sql<UserRow[]>`
    UPDATE users SET
      username = ${b.username ? String(b.username) : u.username},
      name = ${b.name ? String(b.name).trim() : u.name},
      role = ${b.role ? String(b.role) : u.role},
      password_hash = ${b.password ? hashPassword(String(b.password)) : u.password_hash}
    WHERE id = ${u.id}
    RETURNING *`;
  return ok(await withTenants(updated));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const u = await findUser(ctx);
  if (!u) return fail(404, "Akun tidak ditemukan");
  if (u.id === admin.id) return fail(400, "Tidak bisa menghapus akun yang sedang dipakai");
  if (u.role === "admin" && (await adminCount()) <= 1) return fail(400, "Harus ada minimal satu admin");
  await sql`DELETE FROM users WHERE id = ${u.id}`;
  return noContent();
}
