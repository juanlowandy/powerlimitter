// Resource: colokan (outlet) milik satu tenant — daftar
//   GET /api/tenants/:id/outlets   [{ no, command, state }, { no, command, state }]
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getTenant } from "@/lib/tenants";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const t = await getTenant(user, (await params).id);
  return t ? ok(t.outlets) : fail(404, "Tenant tidak ditemukan");
}
