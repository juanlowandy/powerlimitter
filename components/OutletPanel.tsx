"use client";

// Panel 2 colokan + peringatan + permintaan tenant.
//   Pemilik tenant : nyalakan/matikan colokan 1, matikan colokan 2, minta izin colokan 2,
//                    minta tambah arus saat mendekati/melewati alokasi.
//   Admin          : semua colokan, sambung ulang setelah over-limit (dengan opsi tambah alokasi),
//                    setujui/tolak permintaan tenant.
import { useState } from "react";
import { api } from "@/lib/client";
import { useSession } from "@/lib/session";
import { ampere } from "@/lib/format";
import type { OnOff, Tenant } from "@/lib/types";
import { MAX_LIMIT_A } from "@/lib/limits";

export default function OutletPanel({ tenant }: { tenant: Tenant }) {
  const { isAdmin, refreshTenants } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newLimit, setNewLimit] = useState(String(Math.min(tenant.limitA + 1, MAX_LIMIT_A)));
  const base = `/api/tenants/${tenant.id}`;

  async function run(...steps: (() => Promise<unknown>)[]) {
    setBusy(true);
    setError("");
    try {
      for (const step of steps) await step();
      await refreshTenants();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setOutlet = (no: 1 | 2, command: OnOff) => () => api(`${base}/outlets/${no}`, { method: "PUT", body: { command } });
  const request = (type: "outlet2" | "allocation") => () => api(`${base}/requests`, { method: "POST", body: { type } });
  const reject = (type: "outlet2" | "allocation") => () => api(`${base}/requests/${type}`, { method: "DELETE" });
  const raiseLimit = () => api(base, { method: "PATCH", body: { limitA: Number(newLimit.replace(",", ".")) } });

  const current = tenant.latest?.current ?? 0;
  const limitInput = (
    <input className="input input-small" inputMode="decimal" value={newLimit} onChange={(e) => setNewLimit(e.target.value)}
      aria-label="Alokasi baru (A)" />
  );

  return (
    <div className="outlet-panel">
      {/* Over-limit */}
      {tenant.tripped && (
        <div className="alert trip">
          <strong>Diputus: arus melebihi alokasi {ampere(tenant.limitA)} A</strong>
          {isAdmin ? (
            <>
              <p>Tawarkan tambah alokasi ke tenant, atau sambungkan ulang tanpa menambah.</p>
              <div className="alert-actions">
                {limitInput} <span>A</span>
                <button className="btn-small" disabled={busy} onClick={() => run(raiseLimit, setOutlet(1, "ON"))}>Naikkan &amp; sambungkan</button>
                <button className="btn-small secondary" disabled={busy} onClick={() => run(setOutlet(1, "ON"))}>Sambungkan tanpa menambah</button>
              </div>
            </>
          ) : (
            <>
              <p>Kurangi alat yang menyala, lalu hubungi pengelola untuk menyambungkan ulang atau menambah alokasi.</p>
              <div className="alert-actions">
                {tenant.requests.allocation
                  ? <span className="muted">Permintaan tambah arus terkirim, menunggu pengelola.</span>
                  : <button className="btn-small" disabled={busy} onClick={() => run(request("allocation"))}>Minta tambah arus</button>}
              </div>
            </>
          )}
        </div>
      )}

      {/* Mendekati batas */}
      {!tenant.tripped && tenant.warning && (
        <div className="alert warn">
          <strong>Arus {ampere(current)} A mendekati alokasi {ampere(tenant.limitA)} A</strong>
          {isAdmin ? (
            <p>Tenant akan diputus otomatis jika arus melewati alokasi. Pertimbangkan menawarkan tambah alokasi.</p>
          ) : (
            <>
              <p>Hubungi pengelola untuk menambah alokasi arus sebelum listrik diputus otomatis.</p>
              <div className="alert-actions">
                {tenant.requests.allocation
                  ? <span className="muted">Permintaan tambah arus terkirim, menunggu pengelola.</span>
                  : <button className="btn-small" disabled={busy} onClick={() => run(request("allocation"))}>Minta tambah arus</button>}
              </div>
            </>
          )}
        </div>
      )}

      {/* Permintaan tenant (dilihat admin) */}
      {isAdmin && tenant.requests.allocation && !tenant.tripped && (
        <div className="alert info">
          <strong>Tenant meminta tambah alokasi arus</strong>
          <div className="alert-actions">
            {limitInput} <span>A</span>
            <button className="btn-small" disabled={busy} onClick={() => run(raiseLimit)}>Naikkan alokasi</button>
            <button className="btn-small secondary" disabled={busy} onClick={() => run(reject("allocation"))}>Tolak</button>
          </div>
        </div>
      )}
      {isAdmin && tenant.requests.outlet2 && (
        <div className="alert info">
          <strong>Tenant meminta izin menyalakan colokan 2</strong>
          <div className="alert-actions">
            <button className="btn-small" disabled={busy || tenant.tripped} onClick={() => run(setOutlet(2, "ON"))}>Setujui &amp; nyalakan</button>
            <button className="btn-small secondary" disabled={busy} onClick={() => run(reject("outlet2"))}>Tolak</button>
          </div>
        </div>
      )}

      {/* Dua colokan */}
      {tenant.outlets.map((o) => {
        const on = o.command === "ON";
        const waiting = tenant.online && o.state && o.state !== o.command;
        let action: React.ReactNode;
        if (on) {
          action = <button className="btn-small secondary" disabled={busy} onClick={() => run(setOutlet(o.no, "OFF"))}>Matikan</button>;
        } else if (isAdmin) {
          action = <button className="btn-small" disabled={busy} onClick={() => run(setOutlet(o.no, "ON"))}>Nyalakan</button>;
        } else if (tenant.tripped) {
          action = <button className="btn-small" disabled>Diputus</button>;
        } else if (o.no === 1) {
          action = <button className="btn-small" disabled={busy} onClick={() => run(setOutlet(1, "ON"))}>Nyalakan</button>;
        } else if (tenant.requests.outlet2) {
          action = <button className="btn-small" disabled>Menunggu izin</button>;
        } else {
          action = <button className="btn-small" disabled={busy} onClick={() => run(request("outlet2"))}>Minta izin</button>;
        }
        return (
          <div className="outlet-row" key={o.no}>
            <div>
              <strong>Colokan {o.no}</strong>
              <small>{o.no === 1 ? "Bisa dinyalakan tenant" : "Butuh izin pengelola"}{waiting ? " · menunggu ESP32" : ""}</small>
            </div>
            <span className={on ? "status-tag ok" : "status-tag off"}>{on ? "ON" : "OFF"}</span>
            {action}
          </div>
        );
      })}

      <p className="demo-note">{error || "Perintah diterima ESP32 pada laporan berikutnya (±10 detik)."}</p>
    </div>
  );
}
