"use client";

import { useState } from "react";
import { redirect } from "next/navigation";
import { api, usePolling } from "@/lib/client";
import { useSession } from "@/lib/session";
import type { Tenant, UserWithTenants } from "@/lib/types";
import Modal from "@/components/Modal";
import StatusTag from "@/components/StatusTag";
import { ampere } from "@/lib/format";

// Form tambah / ubah tenant
function TenantForm({ initial, owners, onSaved }: {
  initial: Tenant | null;
  owners: UserWithTenants[];
  onSaved: () => void;
}) {
  const isNew = !initial;
  const [form, setForm] = useState({
    id: initial?.id ?? "",
    name: initial?.name ?? "",
    location: initial?.location ?? "",
    limitA: String(initial?.limitA ?? 2),
    ownerId: initial?.owner ? String(initial.owner.id) : "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = { ...form, limitA: Number(form.limitA.replace(",", ".")), ownerId: form.ownerId ? Number(form.ownerId) : null };
    try {
      if (isNew) await api("/api/tenants", { method: "POST", body });
      else await api(`/api/tenants/${initial.id}`, { method: "PATCH", body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      {error && <div className="error-msg">{error}</div>}
      <div className="form-group">
        <label htmlFor="t-id">DEVICE ID</label>
        <input id="t-id" value={form.id} onChange={set("id")} placeholder="ESP32-002" disabled={!isNew} required />
        <small className="hint">{isNew ? "Harus sama persis dengan DEVICE_ID di firmware ESP32 booth ini." : "Device ID tidak bisa diubah."}</small>
      </div>
      <div className="form-group">
        <label htmlFor="t-name">NAMA TENANT</label>
        <input id="t-name" value={form.name} onChange={set("name")} placeholder="Contoh: Kopi Senja" required />
      </div>
      <div className="form-group">
        <label htmlFor="t-loc">LOKASI BOOTH</label>
        <input id="t-loc" value={form.location} onChange={set("location")} placeholder="Contoh: Booth B2" />
      </div>
      <div className="form-group">
        <label htmlFor="t-limit">ALOKASI ARUS (A)</label>
        <input id="t-limit" inputMode="decimal" value={form.limitA} onChange={set("limitA")} required />
        <small className="hint">Arus total untuk kedua colokan. Maksimal 3 A (batas baca sensor INA219 ±3,2 A).</small>
      </div>
      <div className="form-group">
        <label htmlFor="t-owner">PEMILIK</label>
        <select id="t-owner" value={form.ownerId} onChange={set("ownerId")}>
          <option value="">Belum ada pemilik</option>
          {owners.filter((u) => u.role === "tenant").map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
          ))}
        </select>
        <small className="hint">Pemilik bisa login untuk memantau booth ini. Buat akunnya di menu Akun Pengguna.</small>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : isNew ? "Tambah tenant" : "Simpan perubahan"}</button>
    </form>
  );
}

export default function TenantPage() {
  const { isAdmin, tenants, refreshTenants, selectTenant } = useSession();
  const users = usePolling<UserWithTenants[]>(isAdmin ? "/api/users" : null, 0);
  const [editing, setEditing] = useState<Tenant | "new" | null>(null);
  const [error, setError] = useState("");

  if (!isAdmin) redirect("/");

  async function remove(t: Tenant) {
    if (!confirm(`Hapus ${t.name} (${t.id}) beserta seluruh riwayat datanya?\n\nKalau ESP32-nya masih menyala, tenant akan terdaftar lagi otomatis.`)) return;
    try {
      await api(`/api/tenants/${t.id}`, { method: "DELETE" });
      await refreshTenants();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saved() {
    setEditing(null);
    await refreshTenants();
    users.refresh();
  }

  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">KELOLA TENANT</p>
          <h1>Tenant Bazar</h1>
          <p className="muted">Setiap tenant memiliki ESP32, satu sensor arus, 2 colokan, dan alokasi arus sendiri.</p>
        </div>
        <button className="btn-primary btn-inline" onClick={() => setEditing("new")}>+ Tambah tenant</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <article className="panel history-panel">
        <div className="panel-heading">
          <div><h3>Daftar Tenant</h3><p className="muted">{tenants.length} tenant terdaftar</p></div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>TENANT</th><th>DEVICE ID</th><th>ARUS / ALOKASI</th><th>COLOKAN</th><th>PERMINTAAN</th><th>PEMILIK</th><th>STATUS</th><th /></tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong><small>{t.location || "–"}</small></td>
                  <td>{t.id}</td>
                  <td>{t.latest ? ampere(t.latest.current) : "–"} / {ampere(t.limitA)} A</td>
                  <td>{t.outlets.map((o) => `${o.no}: ${o.command}`).join(" · ")}</td>
                  <td className="wrap">{[t.requests.outlet2 && "Colokan 2", t.requests.allocation && "Tambah arus"].filter(Boolean).join(", ") || "–"}</td>
                  <td>{t.owner?.name ?? "Belum ada"}</td>
                  <td><StatusTag tenant={t} /></td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" title="Lihat di Overview" onClick={() => { selectTenant(t.id); window.location.href = "/"; }}>▦</button>
                      <button className="icon-button" title="Ubah" onClick={() => setEditing(t)}>✎</button>
                      <button className="icon-button danger" title="Hapus" onClick={() => remove(t)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <Modal open={editing !== null} title={editing === "new" ? "Tambah Tenant" : "Ubah Tenant"} onClose={() => setEditing(null)}>
        {editing && (
          <TenantForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            owners={users.data ?? []}
            onSaved={saved}
          />
        )}
      </Modal>
    </>
  );
}
