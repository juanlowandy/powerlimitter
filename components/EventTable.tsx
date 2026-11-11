import { dateTime } from "@/lib/format";
import type { EventItem } from "@/lib/types";

const LABEL: Record<EventItem["type"], string> = {
  TRIP: "Over-limit",
  WARNING: "Mendekati batas",
  OUTLET_ON: "Colokan nyala",
  OUTLET_OFF: "Colokan mati",
  OUTLET2_REQUESTED: "Minta colokan 2",
  OUTLET2_APPROVED: "Colokan 2 disetujui",
  ALLOC_REQUESTED: "Minta tambah arus",
  ALLOC_INCREASED: "Alokasi dinaikkan",
  REQUEST_REJECTED: "Permintaan ditolak",
  LIMIT_CHANGED: "Alokasi diubah",
  TENANT_ADDED: "Tenant baru",
  RELAY_ON: "Disambungkan",
  RELAY_OFF: "Diputus manual",
};

export default function EventTable({ events }: { events: EventItem[] | null }) {
  if (!events) return <p className="muted">Memuat…</p>;
  if (!events.length) return <p className="muted">Belum ada kejadian. Over-limit, peringatan, dan permintaan tenant akan tercatat di sini.</p>;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr><th>WAKTU</th><th>KEJADIAN</th><th>KETERANGAN</th></tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{dateTime(e.ts)}</td>
              <td><span className={`event-tag ${e.type.toLowerCase()}`}>{LABEL[e.type] ?? e.type}</span></td>
              <td className="wrap">{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
