// Resource: usage (ringkasan arus) milik satu tenant — hanya baca
//   GET /api/tenants/:id/usage?from=&to=&bucket=&tz=
//     from, to : rentang waktu ISO 8601 (default 24 jam terakhir)
//     bucket   : lebar satu interval dalam detik (3600 = per jam, 86400 = per hari)
//     tz       : zona waktu IANA, contoh Asia/Jakarta (supaya "per hari" mulai jam 00.00 WIB)
// Balasan: { points: [{ ts, current (rata-rata A), peak (A tertinggi) }],
//            totals: { avgA, peakA, overLimitCount } }
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseTime } from "@/lib/http";
import { findTenantFor } from "@/lib/tenants";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const t = await findTenantFor(user, (await params).id);
  if (!t) return fail(404, "Tenant tidak ditemukan");

  const q = new URL(req.url).searchParams;
  const to = parseTime(q.get("to"), new Date());
  const from = parseTime(q.get("from"), new Date(Date.now() - 86400_000));
  if (!from || !to) return fail(400, "from/to harus format waktu ISO 8601");
  const bucket = Math.max(1, Number(q.get("bucket")) || 3600);
  const tz = q.get("tz") || "UTC";
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz)) return fail(400, "tz tidak valid, contoh Asia/Jakarta");

  try {
    const points = await sql`
      SELECT date_bin(make_interval(secs => ${bucket}), ts AT TIME ZONE ${tz}, TIMESTAMP '2000-01-01') AT TIME ZONE ${tz} AS ts,
             AVG(current_a) AS current, MAX(current_a) AS peak
      FROM readings WHERE tenant_id = ${t.id} AND ts >= ${from} AND ts < ${to}
      GROUP BY 1 ORDER BY 1`;
    const [totals] = await sql`
      SELECT COALESCE(AVG(current_a), 0) AS "avgA", COALESCE(MAX(current_a), 0) AS "peakA",
             (SELECT COUNT(*) FROM events WHERE tenant_id = ${t.id} AND type = 'TRIP'
                AND ts >= ${from} AND ts < ${to}) AS "overLimitCount"
      FROM readings WHERE tenant_id = ${t.id} AND ts >= ${from} AND ts < ${to}`;
    return ok({ points, totals });
  } catch (e) {
    if ((e as { code?: string }).code === "22023") return fail(400, `Zona waktu ${tz} tidak dikenal`);
    throw e;
  }
}
