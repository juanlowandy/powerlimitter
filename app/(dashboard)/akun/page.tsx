"use client";

import { useState } from "react";
import { redirect } from "next/navigation";
import { api, usePolling } from "@/lib/client";
import { useSession } from "@/lib/session";
import type { Role, UserWithTenants } from "@/lib/types";
import Modal from "@/components/Modal";

// Form buat / ubah akun
function UserForm({ initial, onSaved }: { initial: UserWithTenants | null; onSaved: () => void }) {
  const isNew = !initial;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    username: initial?.username ?? "",
    password: "",
    role: (initial?.role ?? "tenant") as Role,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isNew) await api("/api/users", { method: "POST", body: form });
      else await api(`/api/users/${initial.id}`, { method: "PATCH", body: { ...form, password: form.password || undefined } });
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
        <label htmlFor="u-name">NAMA</label>
        <input id="u-name" value={form.name} onChange={set("name")} placeholder="Contoh: Budi (Kopi Senja)" required />
      </div>
      <div className="form-group">
        <label htmlFor="u-user">USERNAME</label>
        <input id="u-user" value={form.username} onChange={set("username")} autoComplete="off" required />
      </div>
      <div className="form-group">
        <label htmlFor="u-pass">{isNew ? "PASSWORD" : "PASSWORD BARU"}</label>
        <input id="u-pass" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" required={isNew} />
        <small className="hint">{isNew ? "Minimal 6 karakter." : "Kosongkan kalau tidak ingin mengganti."}</small>
      </div>
      <div className="form-group">
        <label htmlFor="u-role">PERAN</label>
        <select id="u-role" value={form.role} onChange={set("role")}>
          <option value="tenant">Pemilik tenant: hanya memantau booth miliknya</option>
          <option value="admin">Admin: mengelola semua tenant dan akun</option>
        </select>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : isNew ? "Buat akun" : "Simpan perubahan"}</button>
    </form>
  );
}

export default function AccountsPage() {
  const { user: me, isAdmin, refreshTenants } = useSession();
  const users = usePolling<UserWithTenants[]>(isAdmin ? "/api/users" : null, 0);
  const [editing, setEditing] = useState<UserWithTenants | "new" | null>(null);
  const [error, setError] = useState("");

  if (!isAdmin) redirect("/");

  async function remove(u: UserWithTenants) {
    if (!confirm(`Hapus akun ${u.name} (${u.username})? Booth miliknya tetap ada, hanya tanpa pemilik.`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      users.refresh();
      refreshTenants();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function saved() {
    setEditing(null);
    users.refresh();
    refreshTenants();
  }

  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">AKUN PENGGUNA</p>
          <h1>Akun</h1>
          <p className="muted">Admin mengelola semua tenant. Pemilik tenant hanya bisa memantau booth miliknya.</p>
        </div>
        <button className="btn-primary btn-inline" onClick={() => setEditing("new")}>+ Buat akun</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <article className="panel history-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>NAMA</th><th>USERNAME</th><th>PERAN</th><th>BOOTH</th><th /></tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong>{u.id === me.id && <small>Akun kamu</small>}</td>
                  <td>{u.username}</td>
                  <td><span className={u.role === "admin" ? "tag role-admin" : "tag"}>{u.role === "admin" ? "Admin" : "Pemilik tenant"}</span></td>
                  <td className="wrap">{u.role === "admin" ? "Semua" : u.tenants.map((t) => t.name).join(", ") || "Belum ada"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" title="Ubah" onClick={() => setEditing(u)}>✎</button>
                      {u.id !== me.id && <button className="icon-button danger" title="Hapus" onClick={() => remove(u)}>🗑</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <Modal open={editing !== null} title={editing === "new" ? "Buat Akun" : "Ubah Akun"} onClose={() => setEditing(null)}>
        {editing && <UserForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onSaved={saved} />}
      </Modal>
    </>
  );
}
