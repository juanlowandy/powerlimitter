// Query & validasi akun (dipakai API /api/users).
import { sql } from "./db";
import { toUser, type UserRow } from "./auth";
import type { UserWithTenants } from "./types";

export async function withTenants(u: UserRow): Promise<UserWithTenants> {
  const tenants = await sql<{ id: string; name: string }[]>`SELECT id, name FROM tenants WHERE owner_id = ${u.id} ORDER BY created_at`;
  return { ...toUser(u), tenants: [...tenants] };
}

export function validateUser(b: Record<string, unknown>, isNew: boolean): string | null {
  if ((isNew || b.username !== undefined) && !/^[a-zA-Z0-9._-]{3,32}$/.test(String(b.username ?? ""))) {
    return "Username 3–32 karakter: huruf, angka, titik, - atau _";
  }
  if ((isNew || b.password) && String(b.password ?? "").length < 6) return "Password minimal 6 karakter";
  if ((isNew || b.name !== undefined) && !String(b.name ?? "").trim()) return "Nama wajib diisi";
  if ((isNew || b.role !== undefined) && b.role !== "admin" && b.role !== "tenant") return "Peran harus admin atau tenant";
  return null;
}
