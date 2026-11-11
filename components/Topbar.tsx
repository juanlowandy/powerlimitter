"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";

// Bar atas: pilihan tenant, jumlah hal yang perlu ditindak admin, dan status koneksi ESP32
export default function Topbar() {
  const { tenants, tenant, selectTenant, isAdmin } = useSession();
  const needAction = tenants.filter((t) => t.tripped || t.requests.outlet2 || t.requests.allocation).length;

  return (
    <header className="topbar">
      {tenants.length > 1 ? (
        <select className="tenant-select" value={tenant?.id ?? ""} onChange={(e) => selectTenant(e.target.value)} aria-label="Pilih tenant">
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
          ))}
        </select>
      ) : (
        <span>{tenant ? `${tenant.name} (${tenant.id})` : "Belum ada tenant"}</span>
      )}
      <div className="topbar-right">
        {isAdmin && needAction > 0 && (
          <Link href="/tenant" className="action-badge">{needAction} tenant perlu ditindak</Link>
        )}
        {tenant && (
          <span className={tenant.online ? "online" : "online is-offline"}>
            <i /> {tenant.online ? "ESP32 terhubung" : "ESP32 offline"}
          </span>
        )}
      </div>
    </header>
  );
}
