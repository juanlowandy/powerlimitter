"use client";

import { useState } from "react";
import { useSession } from "@/lib/session";
import { usePolling } from "@/lib/client";
import { ampere, browserTz, time, todayInput } from "@/lib/format";
import type { EventItem, Usage, UsagePoint } from "@/lib/types";
import MetricCard from "@/components/MetricCard";
import PowerChart from "@/components/PowerChart";
import EventTable from "@/components/EventTable";

type Period = "day" | "week";

// Rentang waktu: 1 hari (per jam) atau 7 hari (per hari) sampai tanggal yang dipilih
function range(period: Period, dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const end = new Date(y, m - 1, d + 1).getTime();
  const iso = (t: number) => new Date(t).toISOString();
  return period === "day"
    ? { from: iso(new Date(y, m - 1, d).getTime()), to: iso(end), bucket: 3600 }
    : { from: iso(new Date(y, m - 1, d - 6).getTime()), to: iso(end), bucket: 86400 };
}

const label = (period: Period, t: string) =>
  period === "day" ? time(t) : new Date(t).toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });

function downloadCsv(name: string, points: UsagePoint[], limitA: number) {
  const rows = points.map((p) =>
    [p.ts, p.current.toFixed(3), p.peak.toFixed(3), p.peak > limitA ? "melebihi" : "normal"].join(",")
  );
  const csv = ["waktu,arus_rata_a,arus_puncak_a,status", ...rows].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${name}.csv`;
  a.click();
}

export default function HistoryPage() {
  const { tenant } = useSession();
  const [period, setPeriod] = useState<Period>("day");
  const [day, setDay] = useState(todayInput());
  const r = range(period, day);
  const id = tenant?.id;

  // GET /api/tenants/:id/usage
  const history = usePolling<Usage>(
    id ? `/api/tenants/${id}/usage?from=${r.from}&to=${r.to}&bucket=${r.bucket}&tz=${browserTz()}` : null, 60_000
  );
  const events = usePolling<EventItem[]>(id ? `/api/tenants/${id}/events?limit=50` : null, 60_000);

  if (!tenant) return <article className="panel"><h3>Belum ada tenant</h3></article>;

  const points = history.data?.points ?? [];
  const totals = history.data?.totals;
  const per = period === "day" ? "per Jam" : "per Hari";

  return (
    <>
      <div className="welcome">
        <div>
          <h1>Riwayat {tenant.name}</h1>
          <p className="muted">Arus total kedua colokan {per.toLowerCase()}, alokasi {ampere(tenant.limitA)} A</p>
        </div>
        <div className="toolbar">
          <div className="segmented">
            <button className={period === "day" ? "active" : ""} onClick={() => setPeriod("day")}>Hari</button>
            <button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>7 Hari</button>
          </div>
          <input type="date" className="input" value={day} max={todayInput()} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
      </div>

      <div className="metrics three">
        <MetricCard icon="▲" color="orange" label="Jumlah over-limit" value={String(totals?.overLimitCount ?? "–")} unit="kali" />
        <MetricCard icon="⚡" color="purple" label="Arus rata-rata" value={ampere(totals?.avgA)} unit="A" />
        <MetricCard icon="⇡" color="green" label="Arus puncak" value={ampere(totals?.peakA)} unit="A" note={`Alokasi ${ampere(tenant.limitA)} A`} />
      </div>

      <article className="panel history-panel">
        <div className="panel-heading">
          <div><h3>Arus Puncak {per}</h3><p className="muted">Batang merah = puncak melebihi alokasi</p></div>
          <button className="tag tag-button" disabled={!points.length} onClick={() => downloadCsv(`${tenant.id}_${period}_${day}`, points, tenant.limitA)}>
            ⤓ Unduh CSV
          </button>
        </div>
        <PowerChart bars={points.map((p) => ({ key: p.ts, label: label(period, p.ts), value: p.peak }))} limit={tenant.limitA} unit="A" />

        {points.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>WAKTU</th><th>RATA-RATA</th><th>PUNCAK</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.ts}>
                    <td><strong>{label(period, p.ts)}</strong></td>
                    <td>{ampere(p.current)} A</td>
                    <td className={p.peak > tenant.limitA ? "text-danger" : ""}>{ampere(p.peak)} A</td>
                    <td>{p.peak > tenant.limitA ? "Melebihi alokasi" : p.peak >= tenant.limitA * 0.8 ? "Mendekati" : "Normal"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel history-panel">
        <div className="panel-heading"><div><h3>Log Kejadian</h3><p className="muted">50 kejadian terakhir</p></div></div>
        <EventTable events={events.data} />
      </article>
    </>
  );
}
