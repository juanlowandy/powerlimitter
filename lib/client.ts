// Dipakai di halaman (browser): memanggil API dan polling data berkala.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/session") {
    window.location.href = "/login";
  }
  if (!res.ok) throw new Error(data.error || `Server membalas ${res.status}`);
  return data as T;
}

// Ambil data dari `path` setiap `intervalMs` milidetik. path = null berarti belum siap.
// Kalau URL berisi waktu "sekarang" (misalnya from=Date.now()-90000), kirim fungsi `buildPath`
// supaya URL dihitung ulang setiap kali polling, tanpa mereset data.
export function usePolling<T>(path: string | null, intervalMs: number, buildPath?: () => string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef({ path, buildPath });
  ref.current = { path, buildPath };

  const refresh = useCallback(async () => {
    const { path, buildPath } = ref.current;
    if (!path) return;
    try {
      setData(await api<T>(buildPath ? buildPath() : path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setData(null);
    if (!path) return;
    refresh();
    if (!intervalMs) return;
    // Hemat kuota server: polling berhenti saat tab tidak sedang dibuka
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), intervalMs);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path, intervalMs, refresh]);

  return { data, error, refresh };
}
