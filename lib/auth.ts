// Login memakai cookie yang ditandatangani (HMAC-SHA256).
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "./db";
import { config } from "./config";
import { fail } from "./http";
import type { User } from "./types";

const COOKIE = "sp_session";
const MAX_AGE_S = 7 * 24 * 60 * 60; // 7 hari

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  name: string;
  role: "admin" | "tenant";
}

export const toUser = (u: UserRow): User => ({ id: u.id, username: u.username, name: u.name, role: u.role });

function sign(value: string) {
  if (!config.authSecret) throw new Error("AUTH_SECRET belum diisi di Environment Variables");
  return crypto.createHmac("sha256", config.authSecret).update(value).digest("base64url");
}

export async function startSession(userId: number) {
  const value = `${userId}.${Date.now() + MAX_AGE_S * 1000}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    secure: config.isProd,  // di Vercel (HTTPS) cookie hanya dikirim lewat HTTPS
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<UserRow | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [uid, exp, sig] = raw.split(".");
  const expected = sign(`${uid}.${exp}`);
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  const [user] = await sql<UserRow[]>`SELECT * FROM users WHERE id = ${Number(uid)}`;
  return user ?? null;
}

// Pemakaian di route:  const user = await requireUser();  if (user instanceof Response) return user;
export async function requireUser(): Promise<UserRow | Response> {
  return (await currentUser()) ?? fail(401, "Silakan login terlebih dahulu");
}

export async function requireAdmin(): Promise<UserRow | Response> {
  const user = await currentUser();
  if (!user) return fail(401, "Silakan login terlebih dahulu");
  if (user.role !== "admin") return fail(403, "Hanya admin yang boleh melakukan ini");
  return user;
}

// Untuk endpoint yang dipanggil ESP32 (header X-Device-Key)
export function checkDeviceKey(req: Request): Response | null {
  if (!config.deviceKey) {
    return config.isProd ? fail(503, "DEVICE_KEY belum diatur di server") : null;
  }
  return req.headers.get("x-device-key") === config.deviceKey ? null : fail(401, "X-Device-Key salah atau tidak ada");
}
