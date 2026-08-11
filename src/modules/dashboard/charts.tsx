import type { DailyPoint } from "./dashboard";

export function BarChart({ data, unit, color = "#6d4cc4" }: { data: DailyPoint[]; unit: string; color?: string }) {
  const hasData = data.some((point) => point.value > 0);
  if (!hasData) return <div className="mt-5 grid h-44 place-items-center rounded-2xl bg-[#f7f5f9] px-5 text-center text-sm font-medium text-[var(--color-muted)]">Chưa có dữ liệu trong 7 ngày gần nhất</div>;
  const max = Math.max(1, ...data.map((point) => point.value));
  return <figure className="mt-5" aria-label={`Biểu đồ ${unit} trong 7 ngày`}>
    <div className="flex h-36 items-end gap-2 border-b border-[var(--color-border)]">
      {data.map((point, index) => <div key={`${point.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
        <span className="text-[10px] font-bold text-[var(--color-muted)]">{point.value ? point.value.toFixed(point.value < 10 ? 1 : 0) : ""}</span>
        <div className="w-full min-w-2 rounded-t-lg opacity-90" style={{ height: `${Math.max(point.value ? 8 : 3, (point.value / max) * 104)}px`, backgroundColor: color }} />
      </div>)}
    </div>
    <div className="mt-2 flex gap-2">
      {data.map((point, index) => <span key={`${point.label}-label-${index}`} className="min-w-0 flex-1 text-center text-[10px] font-medium text-[var(--color-muted)]">{point.label}</span>)}
    </div>
  </figure>;
}

export function LineChart({ data, unit, color = "#087f75" }: { data: DailyPoint[]; unit: string; color?: string }) {
  const hasData = data.some((point) => point.value > 0);
  if (!hasData) return <div className="mt-5 grid h-44 place-items-center rounded-2xl bg-[#f7f5f9] px-5 text-center text-sm font-medium text-[var(--color-muted)]">Chưa có dữ liệu trong 7 ngày gần nhất</div>;
  const max = Math.max(1, ...data.map((point) => point.value));
  const width = 280;
  const height = 112;
  const points = data.map((point, index) => `${(index / Math.max(1, data.length - 1)) * width},${height - (point.value / max) * (height - 16)}`).join(" ");

  return <figure className="mt-5" aria-label={`Biểu đồ ${unit} trong 7 ngày`}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" className="h-36 w-full overflow-visible" aria-hidden="true">
      <line x1="0" y1={height} x2={width} y2={height} stroke="#e8e3ed" strokeWidth="1" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((point, index) => {
        const x = (index / Math.max(1, data.length - 1)) * width;
        const y = height - (point.value / max) * (height - 16);
        return <g key={index}><circle cx={x} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="3" />{point.value > 0 ? <text x={x} y={Math.max(10, y - 9)} textAnchor="middle" fill="#686371" fontSize="9" fontWeight="700">{point.value.toFixed(1)}</text> : null}</g>;
      })}
    </svg>
    <div className="flex">
      {data.map((point, index) => <span key={index} className="flex-1 text-center text-[10px] font-medium text-[var(--color-muted)]">{point.label}</span>)}
    </div>
  </figure>;
}
