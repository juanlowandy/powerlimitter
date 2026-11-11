// Resource: session (sesi login)
//   POST   /api/session   login    { username, password } -> 201 + data akun
//   GET    /api/session   akun yang sedang login
//   DELETE /api/session   logout   -> 204
import { sql } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { endSession, requireUser, startSession, toUser, type UserRow } from "@/lib/auth";
import { created, fail, noContent, ok, readJson } from "@/lib/http";

export async function POST(req: Request) {
  const b = await readJson(req);
  const [user] = await sql<UserRow[]>`SELECT * FROM users WHERE lower(username) = lower(${String(b.username ?? "").trim()})`;
  if (!user || !verifyPassword(String(b.password ?? ""), user.password_hash)) {
    return fail(401, "Username atau password salah");
  }
  await startSession(user.id);
  return created(toUser(user));
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return ok(toUser(user));
}

export async function DELETE() {
  await endSession();
  return noContent();
}
