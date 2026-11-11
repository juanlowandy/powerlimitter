// Bentuk respons API yang seragam (konvensi):
//   sukses  -> JSON data langsung, status 200 (baca/ubah) atau 201 (dibuat)
//   dihapus -> 204 tanpa isi
//   gagal   -> { "error": "pesan" } dengan status 400/401/403/404/409/500

export const ok = (data: unknown) => Response.json(data);
export const created = (data: unknown) => Response.json(data, { status: 201 });
export const noContent = () => new Response(null, { status: 204 });
export const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

// Membaca parameter waktu ISO 8601 dari query string, contoh ?from=2026-10-20T00:00:00Z
export function parseTime(value: string | null, fallback: Date): Date | null {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
