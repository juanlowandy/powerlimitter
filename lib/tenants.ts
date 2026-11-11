// Query & bentuk JSON tenant (dipakai beberapa API route).
import { sql } from "./db";
import { OFFLINE_AFTER_MS } from "./config";
import type { UserRow } from "./auth";
import type { OnOff, Tenant } from "./types";

export interface TenantRow {
  id: string;
  name: string;
  location: string;
  limit_a: number;
  outlet1_command: OnOff;
  outlet2_command: OnOff;
  outlet1_state: OnOff | null;
  outlet2_state: OnOff | null;
  tripped: boolean;
  warning: boolean;
  outlet2_requested: boolean;
  alloc_requested: boolean;
  owner_id: number | null;
  last_seen: Date | null;
}

interface TenantJoinRow extends TenantRow {
  owner_name: string | null;
  r_ts: Date | null;
  r_voltage: number | null;
  r_current: number | null;
}

function toTenant(t: TenantJoinRow): Tenant {
  return {
    id: t.id,
    name: t.name,
    location: t.location,
    limitA: t.limit_a,
    outlets: [
      { no: 1, command: t.outlet1_command, state: t.outlet1_state },
      { no: 2, command: t.outlet2_command, state: t.outlet2_state },
    ],
    tripped: t.tripped,
    warning: t.warning,
    requests: { outlet2: t.outlet2_requested, allocation: t.alloc_requested },
    online: !!t.last_seen && Date.now() - t.last_seen.getTime() < OFFLINE_AFTER_MS,
    lastSeen: t.last_seen?.toISOString() ?? null,
    owner: t.owner_id ? { id: t.owner_id, name: t.owner_name ?? "" } : null,
    latest: t.r_ts ? { ts: t.r_ts.toISOString(), voltage: t.r_voltage!, current: t.r_current! } : null,
  };
}

// Tenant + nama pemilik + pembacaan terakhir, dalam satu query.
// Admin melihat semua; pemilik tenant hanya miliknya.
export async function listTenants(user: UserRow, id?: string): Promise<Tenant[]> {
  const rows = await sql<TenantJoinRow[]>`
    SELECT t.*, u.name AS owner_name,
           r.ts AS r_ts, r.voltage_v AS r_voltage, r.current_a AS r_current
    FROM tenants t
    LEFT JOIN users u ON u.id = t.owner_id
    LEFT JOIN LATERAL (
      SELECT ts, voltage_v, current_a FROM readings
      WHERE tenant_id = t.id ORDER BY ts DESC LIMIT 1
    ) r ON true
    WHERE true
      ${user.role === "admin" ? sql`` : sql`AND t.owner_id = ${user.id}`}
      ${id ? sql`AND t.id = ${id}` : sql``}
    ORDER BY t.created_at`;
  return rows.map(toTenant);
}

export async function getTenant(user: UserRow, id: string): Promise<Tenant | null> {
  const [t] = await listTenants(user, id.toUpperCase());
  return t ?? null;
}

// Baris mentah tenant, hanya kalau user boleh melihatnya (admin, atau pemiliknya)
export async function findTenantFor(user: UserRow, id: string): Promise<TenantRow | null> {
  const [t] = await sql<TenantRow[]>`SELECT * FROM tenants WHERE id = ${id.toUpperCase()}`;
  if (!t) return null;
  if (user.role !== "admin" && t.owner_id !== user.id) return null;
  return t;
}

// Format angka ampere untuk pesan log, contoh 2.35 -> "2,35 A"
export const amp = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })} A`;
