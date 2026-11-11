interface Props {
  icon: string;
  color: "purple" | "blue" | "orange" | "green";
  label: string;
  value: string;
  unit: string;
  note?: string;
  stale?: boolean;   // data lama (ESP32 offline): angka diredupkan
}

export default function MetricCard({ icon, color, label, value, unit, note, stale }: Props) {
  return (
    <article className={stale ? "metric stale" : "metric"}>
      <div className={`metric-icon ${color}`}>{icon}</div>
      <p className="muted">{label}</p>
      <h2>{value} <small>{unit}</small></h2>
      {note && <span className="metric-note">{note}</span>}
    </article>
  );
}
