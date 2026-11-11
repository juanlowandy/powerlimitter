// Resource: users (akun) — khusus admin
//   GET  /api/users   daftar akun
//   POST /api/users   buat akun { username, password, name, role } -> 201
import { sql } from "@/lib/db";
import { requireAdmin, type UserRow } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { created, fail, ok, readJson } from "@/lib/http";
import { validateUser, withTenants } from "@/lib/users";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const users = await sql<UserRow[]>`SELECT * FROM users ORDER BY role, name`;
  return ok(await Promise.all(users.map(withTenants)));
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const b = await readJson(req);
  const error = validateUser(b, true);
  if (error) return fail(400, error);
  const [exists] = await sql`SELECT 1 FROM users WHERE lower(username) = lower(${String(b.username)})`;
  if (exists) return fail(409, `Username ${b.username} sudah dipakai`);

  const [user] = await sql<UserRow[]>`
    INSERT INTO users (username, password_hash, name, role)
    VALUES (${String(b.username)}, ${hashPassword(String(b.password))}, ${String(b.name).trim()}, ${String(b.role)})
    RETURNING *`;
  return created(await withTenants(user));
}
