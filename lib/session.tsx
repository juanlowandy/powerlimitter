// Menyimpan akun yang login, daftar tenant, dan tenant yang sedang dipilih.
// Daftar tenant diperbarui setiap 5 detik supaya status selalu terkini.
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api, usePolling } from "./client";
import type { Tenant, User } from "./types";

interface Session {
  user: User;
  isAdmin: boolean;
  tenants: Tenant[];
  tenant: Tenant | null;          // tenant yang dipilih
  selectTenant: (id: string) => void;
  refreshTenants: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const { data, refresh } = usePolling<Tenant[]>("/api/tenants", 5000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tenants = data ?? [];

  useEffect(() => {
    const saved = localStorage.getItem("sp_tenant");
    if (saved) setSelectedId(saved);
  }, []);

  const selectTenant = (id: string) => {
    setSelectedId(id);
    localStorage.setItem("sp_tenant", id);
  };

  const logout = async () => {
    await api("/api/session", { method: "DELETE" });
    window.location.href = "/login";
  };

  const tenant = tenants.find((t) => t.id === selectedId) ?? tenants[0] ?? null;

  return (
    <SessionContext.Provider
      value={{ user, isAdmin: user.role === "admin", tenants, tenant, selectTenant, refreshTenants: refresh, logout }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession harus dipakai di dalam SessionProvider");
  return s;
}
