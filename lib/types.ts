// Tipe data JSON yang dipakai bersama oleh API (server) dan halaman (browser).
// Konvensi: nama field camelCase, waktu dalam ISO 8601 (UTC), satuan V / A.

export type Role = "admin" | "tenant";
export type OnOff = "ON" | "OFF";

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
}

export interface UserWithTenants extends User {
  tenants: { id: string; name: string }[];
}

export interface Outlet {
  no: 1 | 2;
  command: OnOff;        // perintah dari website
  state: OnOff | null;   // laporan terakhir dari ESP32
}

export interface Reading {
  ts: string;
  voltage: number;   // V
  current: number;   // A (arus total kedua colokan)
}

export interface Tenant {
  id: string;        // Device ID ESP32, contoh "ESP32-001"
  name: string;
  location: string;
  limitA: number;    // alokasi arus (ampere)
  outlets: [Outlet, Outlet];
  tripped: boolean;  // diputus karena melebihi alokasi
  warning: boolean;  // arus >= 80% alokasi
  requests: { outlet2: boolean; allocation: boolean };
  online: boolean;
  lastSeen: string | null;
  owner: { id: number; name: string } | null;
  latest: Reading | null;
}

export interface UsagePoint {
  ts: string;        // awal interval
  current: number;   // rata-rata A
  peak: number;      // A tertinggi
}

export interface Usage {
  points: UsagePoint[];
  totals: { avgA: number; peakA: number; overLimitCount: number };
}

export type EventType =
  | "TENANT_ADDED" | "WARNING" | "TRIP" | "OUTLET_ON" | "OUTLET_OFF"
  | "OUTLET2_REQUESTED" | "OUTLET2_APPROVED" | "ALLOC_REQUESTED" | "ALLOC_INCREASED"
  | "REQUEST_REJECTED" | "LIMIT_CHANGED" | "RELAY_ON" | "RELAY_OFF";

export interface EventItem {
  id: number;
  ts: string;
  type: EventType;
  message: string;
}
