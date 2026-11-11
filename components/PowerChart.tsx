// Grafik batang sederhana (tanpa library) dengan garis batas daya.
// Batang yang melewati batas diberi warna merah.
interface Props {
  bars: { key: string; label: string; value: number }[];
  limit?: number;        // garis batas (opsional)
  unit: string;
  showEvery?: number;    // tampilkan label sumbu-x setiap N batang
}

const MAX_BARS = 60; // lebih dari ini batangnya terlalu tipis, jadi hanya yang terbaru digambar

export default function PowerChart({ bars: allBars, limit, unit, showEvery = 1 }: Props) {
  const bars = allBars.slice(-MAX_BARS);
  const max = Math.max(limit ? limit * 1.25 : 0, ...bars.map((b) => b.value), 1);
  const pct = (v: number) => `${(v / max) * 100}%`;

  if (!bars.length) return <div className="chart chart-empty">Belum ada data</div>;

  return (
    <div className="chart" style={{ gap: bars.length > 24 ? 2 : 12 }}>
      {limit !== undefined && (
        <div className="limit-line" style={{ bottom: pct(limit) }}>
          <span>Batas {limit.toLocaleString("id-ID")} {unit}</span>
        </div>
      )}
      {bars.map((b, i) => (
        <div className="bar-column" key={b.key} title={`${b.label}: ${b.value.toLocaleString("id-ID", { maximumFractionDigits: 2 })} ${unit}`}>
          <div className={limit !== undefined && b.value > limit ? "bar over" : "bar"} style={{ height: pct(b.value) }} />
          {i % showEvery === 0 && <small>{b.label}</small>}
        </div>
      ))}
    </div>
  );
}
