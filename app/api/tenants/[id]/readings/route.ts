// Resource: readings (pembacaan sensor) milik satu tenant
//   GET  /api/tenants/:id/readings?from=&to=&limit=   daftar pembacaan mentah (user login)
//   POST /api/tenants/:id/readings                    ESP32 mengirim pembacaan baru -> 201
//
// Body POST dari ESP32 (header X-Device-Key wajib saat online):
//   { "voltage": 12.1, "current": 1.72, "outlet1": "ON", "outlet2": "OFF", "tripped": false, "tripCurrent": 2.31 }
//   current = arus TOTAL kedua colokan (satu INA219). tripCurrent opsional: arus saat relay diputus.
// Balasan 201:
//   { "reading": {...}, "command": { "outlet1": "ON", "outlet2": "OFF", "limitA": 2, "intervalMs": 10000 } }
//
// Keputusan memutus relay dibuat ESP32 sendiri (tetap aman walau Wi-Fi/server mati).
// Server mencatat kejadian, mengatur peringatan 80%, dan menahan kedua colokan OFF
// sampai admin menyambungkan ulang.
import { sql } from "@/lib/db";
import { config, WARN_CLEAR_RATIO, WARN_RATIO } from "@/lib/config";
import { checkDeviceKey, requireUser } from "@/lib/auth";
import { created, fail, ok, parseTime, readJson } from "@/lib/http";
import { amp, findTenantFor, type TenantRow } from "@/lib/tenants";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const t = await findTenantFor(user, (await params).id);
  if (!t) return fail(404, "Tenant tidak ditemukan");

  const q = new URL(req.url).searchParams;
  const to = parseTime(q.get("to"), new Date());
  const from = parseTime(q.get("from"), new Date(Date.now() - 3600_000));
  if (!from || !to) return fail(400, "from/to harus format waktu ISO 8601, contoh 2026-10-20T08:00:00Z");
  const limit = Math.min(Math.max(Number(q.get("limit")) || 500, 1), 5000);

  const rows = await sql`
    SELECT ts, voltage_v AS voltage, current_a AS current
    FROM readings WHERE tenant_id = ${t.id} AND ts >= ${from} AND ts < ${to}
    ORDER BY ts DESC LIMIT ${limit}`;
  return ok([...rows].reverse()); // urut dari yang paling lama
}

const onOff = (v: unknown) => (v === "ON" || v === "OFF" ? v : null);

export async function POST(req: Request, { params }: Ctx) {
  const denied = checkDeviceKey(req);
  if (denied) return denied;

  const id = (await params).id.toUpperCase();
  const b = await readJson(req);
  const voltage = Number(b.voltage);
  const current = Math.max(0, Number(b.current));
  if (![voltage, current].every(Number.isFinite)) {
    return fail(400, "Wajib ada angka: voltage (V) dan current (A)");
  }
  const power = Number.isFinite(Number(b.power)) ? Math.max(0, Number(b.power)) : voltage * current;
  const state1 = onOff(b.outlet1);
  const state2 = onOff(b.outlet2);

  // Semua perubahan dalam satu transaksi: simpan pembacaan + update status tenant + log kejadian
  const result = await sql.begin(async (tx) => {
    const [t] = await tx<TenantRow[]>`SELECT * FROM tenants WHERE id = ${id} FOR UPDATE`;
    if (!t) return null;

    const maxGap = (config.reportIntervalMs * 3) / 1000;
    const dtS = t.last_seen ? Math.min((Date.now() - t.last_seen.getTime()) / 1000, maxGap) : 0;

    const [reading] = await tx`
      INSERT INTO readings (tenant_id, voltage_v, current_a, power_w, dt_s)
      VALUES (${id}, ${voltage}, ${current}, ${power}, ${dtS})
      RETURNING ts, voltage_v AS voltage, current_a AS current`;

    let cmd1 = t.outlet1_command;
    let cmd2 = t.outlet2_command;
    let tripped = t.tripped;
    let warning = t.warning;

    if (b.tripped === true && !t.tripped) {
      // ESP32 baru saja memutus kedua colokan karena melebihi alokasi
      tripped = true;
      warning = false;
      cmd1 = "OFF";
      cmd2 = "OFF";
      const tripCurrent = Number(b.tripCurrent) || current;
      await tx`INSERT INTO events (tenant_id, type, message)
               VALUES (${id}, 'TRIP', ${`Arus ${amp(tripCurrent)} melebihi alokasi ${amp(t.limit_a)}, kedua colokan diputus`})`;
    } else if (b.tripped === false && t.tripped && (cmd1 === "ON" || cmd2 === "ON")) {
      tripped = false; // ESP32 sudah menyambung ulang setelah admin menyalakan colokan
    }

    // Peringatan dini saat arus mendekati alokasi (sekali per kejadian, tidak berulang)
    if (!tripped) {
      const ratio = current / t.limit_a;
      if (!warning && ratio >= WARN_RATIO) {
        warning = true;
        await tx`INSERT INTO events (tenant_id, type, message)
                 VALUES (${id}, 'WARNING', ${`Arus ${amp(current)} mendekati alokasi ${amp(t.limit_a)} (${Math.round(ratio * 100)}%)`})`;
      } else if (warning && ratio < WARN_CLEAR_RATIO) {
        warning = false;
      }
    }

    await tx`UPDATE tenants SET last_seen = now(),
               outlet1_state = COALESCE(${state1}, outlet1_state), outlet2_state = COALESCE(${state2}, outlet2_state),
               outlet1_command = ${cmd1}, outlet2_command = ${cmd2}, tripped = ${tripped}, warning = ${warning}
             WHERE id = ${id}`;

    return {
      reading,
      command: { outlet1: cmd1, outlet2: cmd2, limitA: t.limit_a, intervalMs: config.reportIntervalMs },
    };
  });

  if (!result) return fail(404, `Tenant ${id} belum didaftarkan. Tambahkan dulu di menu Kelola Tenant.`);
  return created(result);
}
