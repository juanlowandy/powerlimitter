"use client";

import { useSession } from "@/lib/session";
import { usePolling } from "@/lib/client";
import { ago, ampere, browserTz, num, time } from "@/lib/format";
import type { EventItem, Reading, Usage } from "@/lib/types";
import MetricCard from "@/components/MetricCard";
import PowerChart from "@/components/PowerChart";
import StatusTag from "@/components/StatusTag";
import OutletPanel from "@/components/OutletPanel";
import EventTable from "@/components/EventTable";

const LIVE_WINDOW_MS = 10 * 60_000; // grafik: 10 menit terakhir

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function OverviewPage() {
  const { isAdmin, tenant } = useSession();
  const id = tenant?.id;

  // GET /api/tenants/:id/readings  -> arus 10 menit terakhir
  const live = usePolling<Reading[]>(id ? `live-${id}` : null, 10_000,
    () => `/api/tenants/${id}/readings?from=${new Date(Date.now() - LIVE_WINDOW_MS).toISOString()}`);
  // GET /api/tenants/:id/usage  -> arus puncak & jumlah over-limit hari ini
  const today = usePolling<Usage>(id ? `today-${id}` : null, 30_000,
    () => `/api/tenants/${id}/usage?from=${startOfToday()}&bucket=86400&tz=${browserTz()}`);
  // GET /api/tenants/:id/events
  const events = usePolling<EventItem[]>(id ? `/api/tenants/${id}/events?limit=6` : null, 15_000);

  if (!tenant) {
    return (
      <article className="panel">
        <h3>Belum ada tenant</h3>
        <p className="muted">
          {isAdmin
            ? "Tambahkan tenant di menu Kelola Tenant, lalu nyalakan ESP32 dengan DEVICE_ID yang sama."
            : "Akun kamu belum dihubungkan ke booth mana pun. Minta pengelola bazar untuk menghubungkannya."}
        </p>
      </article>
    );
  }

  const stale = !tenant.online;
  const current = tenant.latest?.current ?? 0;
  const percent = Math.round((current / tenant.limitA) * 100);
  const activeOutlets = tenant.outlets.filter((o) => o.command === "ON").length;
  const bars = (live.data ?? []).map((r) => ({ key: r.ts, label: time(r.ts), value: r.current }));

  return (
    <>
      <div className="welcome">
        <div>
          <h1>{tenant.name}</h1>
          <p className="muted">
            {tenant.location ? `${tenant.location} · ` : ""}{tenant.id} · data terakhir {ago(tenant.lastSeen)}
          </p>
        </div>
        <StatusTag tenant={tenant} />
      </div>

      <div className="metrics">
        <MetricCard icon="⚡" color="purple" label="Arus total" value={ampere(tenant.latest?.current)} unit="A"
          note={`${percent}% dari alokasi ${ampere(tenant.limitA)} A`} stale={stale} />
        <MetricCard icon="⌁" color="blue" label="Tegangan" value={num(tenant.latest?.voltage, 2)} unit="V" stale={stale} />
        <MetricCard icon="⏻" color="green" label="Colokan aktif" value={String(activeOutlets)} unit="dari 2" />
        <MetricCard icon="▲" color="orange" label="Over-limit hari ini" value={String(today.data?.totals.overLimitCount ?? "–")} unit="kali"
          note={`Arus puncak ${ampere(today.data?.totals.peakA)} A`} />
      </div>

      <div className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><h3>Arus Total</h3><p className="muted">10 menit terakhir, setiap batang = 1 laporan ESP32</p></div>
            {tenant.online && <span className="tag">Live</span>}
          </div>
          <PowerChart bars={bars} limit={tenant.limitA} unit="A" showEvery={12} />
          <div className="chart-legend"><i /> Arus (A) <i className="legend-over" /> Melebihi alokasi</div>
        </article>

        <article className="panel device-panel">
          <div className="panel-heading">
            <div><h3>Colokan</h3><p className="muted">Alokasi {ampere(tenant.limitA)} A untuk kedua colokan</p></div>
          </div>
          <OutletPanel key={tenant.id} tenant={tenant} />
        </article>
      </div>

      <article className="panel history-panel">
        <div className="panel-heading">
          <div><h3>Kejadian Terbaru</h3><p className="muted">Over-limit, peringatan, dan permintaan tenant</p></div>
        </div>
        <EventTable events={events.data} />
      </article>
    </>
  );
}
