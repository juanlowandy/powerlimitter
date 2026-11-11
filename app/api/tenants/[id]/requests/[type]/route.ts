// Resource: satu permintaan tenant
//   DELETE /api/tenants/:id/requests/:type   (type = outlet2 | allocation) -> 204
//     admin  = menolak permintaan
//     pemilik = membatalkan permintaannya sendiri
import { sql, logEvent } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, noContent } from "@/lib/http";
import { findTenantFor } from "@/lib/tenants";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; type: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const p = await params;
  const t = await findTenantFor(user, p.id);
  if (!t) return fail(404, "Tenant tidak ditemukan");

  const label = p.type === "outlet2" ? "colokan 2" : p.type === "allocation" ? "tambah arus" : null;
  if (!label) return fail(404, "Jenis permintaan hanya outlet2 atau allocation");
  const pending = p.type === "outlet2" ? t.outlet2_requested : t.alloc_requested;
  if (!pending) return fail(404, `Tidak ada permintaan ${label}`);

  if (p.type === "outlet2") await sql`UPDATE tenants SET outlet2_requested = false WHERE id = ${t.id}`;
  else await sql`UPDATE tenants SET alloc_requested = false WHERE id = ${t.id}`;
  await logEvent(t.id, "REQUEST_REJECTED",
    user.role === "admin" ? `Permintaan ${label} ditolak oleh ${user.name}` : `Permintaan ${label} dibatalkan oleh ${user.name}`);
  return noContent();
}
