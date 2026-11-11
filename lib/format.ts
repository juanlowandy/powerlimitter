// Format angka & waktu dalam bahasa Indonesia.
import type { Tenant } from "./types";

export const num = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? "–" : v.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });

type When = string | number;

export const time = (ts: When, seconds = false) =>
  new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", ...(seconds && { second: "2-digit" }) });

export const date = (ts: When) =>
  new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export const dateTime = (ts: When) => `${date(ts)} ${time(ts)}`;

export function ago(ts: When | null) {
  if (!ts) return "belum pernah";
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 5) return "baru saja";
  if (s < 60) return `${s} detik lalu`;
  if (s < 3600) return `${Math.round(s / 60)} menit lalu`;
  return dateTime(ts);
}

export function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 19 ? "Selamat sore" : "Selamat malam";
}

// Status tenant untuk label & warna
export type StatusKey = "ok" | "warn" | "trip" | "off" | "offline";

export function tenantStatus(t: Tenant): { key: StatusKey; label: string } {
  if (t.tripped) return { key: "trip", label: "Over-limit" };
  if (!t.online) return { key: "offline", label: "Offline" };
  if (t.outlets.every((o) => o.command === "OFF")) return { key: "off", label: "Colokan mati" };
  if (t.warning || (t.latest?.current ?? 0) >= t.limitA * 0.8) return { key: "warn", label: "Mendekati batas" };
  return { key: "ok", label: "Normal" };
}

// Angka ampere, contoh 1.234 -> "1,23"
export const ampere = (v: number | null | undefined) => num(v, 2);

// Tanggal hari ini dalam format input <input type="date">
export function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Zona waktu browser, contoh "Asia/Jakarta" (dipakai parameter tz di API usage)
export const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
