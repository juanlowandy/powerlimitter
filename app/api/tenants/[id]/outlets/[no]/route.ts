// Resource: satu colokan
//   GET /api/tenants/:id/outlets/:no   { no, command, state }
//   PUT /api/tenants/:id/outlets/:no   { command: "ON" | "OFF" }
//
// Aturan:
//   - Colokan 1: pemilik tenant boleh menyalakan & mematikan sendiri.
//   - Colokan 2: pemilik tenant hanya boleh mematikan. Menyalakan butuh izin admin
//     (tenant mengajukan lewat POST /api/tenants/:id/requests { type: "outlet2" }).
//   - Setelah over-limit (tripped), hanya admin yang boleh menyalakan kembali.
// ESP32 menerima perintah ini di balasan POST /api/tenants/:id/readings berikutnya.
import { sql, logEvent } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, readJson } from "@/lib/http";
import { findTenantFor, getTenant } from "@/lib/tenants";

type Ctx = { params: Promise<{ id: string; no: string }> };

function parseNo(no: string): 1 | 2 | null {
  return no === "1" ? 1 : no === "2" ? 2 : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const p = await params;
  const no = parseNo(p.no);
  if (!no) return fail(404, "Colokan hanya 1 atau 2");
  const t = await getTenant(user, p.id);
  return t ? ok(t.outlets[no - 1]) : fail(404, "Tenant tidak ditemukan");
}

export async function PUT(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const p = await params;
  const no = parseNo(p.no);
  if (!no) return fail(404, "Colokan hanya 1 atau 2");
  const t = await findTenantFor(user, p.id);
  if (!t) return fail(404, "Tenant tidak ditemukan");

  const { command } = await readJson(req);
  if (command !== "ON" && command !== "OFF") return fail(400, 'command harus "ON" atau "OFF"');

  const isAdmin = user.role === "admin";
  if (command === "ON" && !isAdmin) {
    if (t.tripped) return fail(409, "Listrik booth diputus karena melebihi alokasi. Hubungi pengelola untuk menyambungkan ulang.");
    if (no === 2) return fail(403, "Colokan 2 butuh izin pengelola. Ajukan permintaan terlebih dahulu.");
  }

  const current = no === 1 ? t.outlet1_command : t.outlet2_command;
  if (no === 1) await sql`UPDATE tenants SET outlet1_command = ${command} WHERE id = ${t.id}`;
  else await sql`UPDATE tenants SET outlet2_command = ${command},
                   outlet2_requested = ${command === "ON" ? false : t.outlet2_requested} WHERE id = ${t.id}`;

  if (command === "ON" && no === 2 && t.outlet2_requested) {
    await logEvent(t.id, "OUTLET2_APPROVED", `Permintaan colokan 2 disetujui oleh ${user.name}`);
  } else if (command === "ON" && t.tripped) {
    await logEvent(t.id, "OUTLET_ON", `Colokan ${no} disambungkan ulang oleh ${user.name} setelah over-limit`);
  } else if (command !== current) {
    await logEvent(t.id, command === "ON" ? "OUTLET_ON" : "OUTLET_OFF",
      `Colokan ${no} di${command === "ON" ? "nyalakan" : "matikan"} oleh ${user.name}`);
  }

  const updated = await getTenant(user, t.id);
  return ok(updated!.outlets[no - 1]);
}
