// Resource: permintaan tenant ke pengelola
//   GET  /api/tenants/:id/requests   { outlet2: bool, allocation: bool }
//   POST /api/tenants/:id/requests   { type: "outlet2" | "allocation" } -> 201
//     outlet2    = minta izin menyalakan colokan 2
//     allocation = minta tambah alokasi arus (muncul saat arus mendekati batas / setelah over-limit)
// Admin menjawab dengan: PUT /outlets/2 {command:"ON"} (setujui colokan 2),
// PATCH /api/tenants/:id {limitA} (naikkan alokasi), atau DELETE /requests/:type (tolak).
import { sql, logEvent } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { created, fail, ok, readJson } from "@/lib/http";
import { findTenantFor } from "@/lib/tenants";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const t = await findTenantFor(user, (await params).id);
  if (!t) return fail(404, "Tenant tidak ditemukan");
  return ok({ outlet2: t.outlet2_requested, allocation: t.alloc_requested });
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const t = await findTenantFor(user, (await params).id);
  if (!t) return fail(404, "Tenant tidak ditemukan");

  const { type } = await readJson(req);
  if (type === "outlet2") {
    if (t.outlet2_command === "ON") return fail(400, "Colokan 2 sudah menyala");
    if (t.outlet2_requested) return fail(409, "Permintaan colokan 2 sudah dikirim, menunggu pengelola");
    await sql`UPDATE tenants SET outlet2_requested = true WHERE id = ${t.id}`;
    await logEvent(t.id, "OUTLET2_REQUESTED", `${user.name} meminta izin menyalakan colokan 2`);
  } else if (type === "allocation") {
    if (t.alloc_requested) return fail(409, "Permintaan tambah arus sudah dikirim, menunggu pengelola");
    await sql`UPDATE tenants SET alloc_requested = true WHERE id = ${t.id}`;
    await logEvent(t.id, "ALLOC_REQUESTED", `${user.name} meminta tambah alokasi arus (saat ini ${t.limit_a} A)`);
  } else {
    return fail(400, 'type harus "outlet2" atau "allocation"');
  }
  return created({ outlet2: type === "outlet2" || t.outlet2_requested, allocation: type === "allocation" || t.alloc_requested });
}
