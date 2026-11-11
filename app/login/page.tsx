"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/session", { method: "POST", body: { username, password } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2 className="brand">⚡ Smart<span>Power</span></h2>
          <p className="eyebrow">SMART LIMITER BAZAR</p>
          <p className="muted">Masuk untuk memantau dan mengatur daya listrik booth</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">USERNAME</label>
            <input id="username" placeholder="admin" value={username} onChange={(e) => setUsername(e.target.value)}
              autoComplete="username" required autoFocus />
          </div>

          <div className="form-group">
            <label htmlFor="password">PASSWORD</label>
            <input id="password" type="password" placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Memeriksa…" : "Masuk ke Dashboard"}
          </button>
          <p className="muted center">Belum punya akun? Minta ke pengelola bazar.</p>
        </form>
      </div>
    </main>
  );
}
