// Resource: events (log kejadian) milik satu tenant — hanya baca
//   GET /api/tenants/:id/events?limit=20
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { findTenantFor } from "@/lib/tenants";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const t = await findTenantFor(user, (await params).id);
  if (!t) return fail(404, "Tenant tidak ditemukan");

  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 20, 1), 200);
  return ok(await sql`SELECT id, ts, type, message FROM events WHERE tenant_id = ${t.id} ORDER BY ts DESC LIMIT ${limit}`);
}
