"use client";

import { useId } from "react";
import type { ChartVariant, TimePoint } from "./dashboard";

type DashboardChartProps = {
  data: TimePoint[];
  detailData: TimePoint[];
  unit: string;
  detailUnit: string;
  color: string;
  variant: ChartVariant;
  rangeLabel: string;
  chartLabel: string;
};

const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

function formatValue(value: number) {
  return numberFormatter.format(Math.round(value * 10) / 10);
}

function EmptyChart({ rangeLabel }: { rangeLabel: string }) {
  return <div className="mt-5 grid h-44 place-items-center rounded-2xl bg-[#f7f5f9] px-5 text-center text-sm font-semibold leading-6 text-[var(--color-muted)]">
    Chưa có dữ liệu trong {rangeLabel.toLocaleLowerCase("vi-VN")}
  </div>;
}

function showAxisLabel(index: number, count: number) {
  if (count <= 7) return true;
  if (index === count - 1) return true;
  return index % 3 === 0;
}

export function DashboardChart({ data, detailData, unit, detailUnit, color, variant, rangeLabel, chartLabel }: DashboardChartProps) {
  const gradientId = `dashboard-area-${useId().replaceAll(":", "")}`;
  const hasData = data.some((point) => point.value > 0);
  if (!hasData) return <EmptyChart rangeLabel={rangeLabel} />;

  const max = Math.max(1, ...data.map((point) => point.value));
  const peak = data.reduce((current, point) => point.value > current.value ? point : current, data[0]!);
  const chartName = variant === "bar" ? "Biểu đồ cột" : variant === "area" ? "Biểu đồ vùng" : "Biểu đồ đường";

  return <figure className="mt-5" aria-label={`${chartName} ${unit}, ${rangeLabel}`}>
    <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--color-muted)]">
      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />{chartLabel}</span>
      <span className="tabular-nums">Cao nhất: {formatValue(peak.value)} {unit}</span>
    </figcaption>

    {variant === "bar"
      ? <BarPlot data={data} max={max} color={color} />
      : <TrendPlot data={data} max={max} color={color} variant={variant} gradientId={gradientId} />}

    <details className="mt-3 border-t border-[var(--color-border)] pt-1">
      <summary className="flex min-h-11 list-none items-center text-xs font-extrabold text-[var(--color-primary-strong)] marker:hidden [&::-webkit-details-marker]:hidden">Xem số liệu chi tiết</summary>
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-[#f7f5f9] text-[var(--color-muted)]"><tr><th scope="col" className="px-3 py-2 font-bold">Thời gian</th><th scope="col" className="px-3 py-2 text-right font-bold">{detailUnit}</th></tr></thead>
          <tbody className="divide-y divide-[var(--color-border)]">{detailData.map((point, index) => <tr key={`${point.fullLabel}-${index}`}><th scope="row" className="px-3 py-2 font-semibold">{point.fullLabel}</th><td className="px-3 py-2 text-right font-extrabold tabular-nums">{formatValue(point.value)}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </figure>;
}

function BarPlot({ data, max, color }: { data: TimePoint[]; max: number; color: string }) {
  return <div aria-hidden="true">
    <div className="flex h-36 items-end gap-2 border-b border-[var(--color-border)]">
      {data.map((point, index) => <div key={`${point.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
        <span className="text-[10px] font-extrabold tabular-nums text-[var(--color-muted)]">{point.value ? formatValue(point.value) : ""}</span>
        <span className="w-full min-w-2 rounded-t-lg opacity-90" style={{ height: `${Math.max(point.value ? 8 : 3, (point.value / max) * 104)}px`, backgroundColor: color }} />
      </div>)}
    </div>
    <div className="mt-2 flex gap-2">{data.map((point, index) => <span key={`${point.label}-axis-${index}`} className="min-w-0 flex-1 text-center text-[10px] font-semibold text-[var(--color-muted)]">{point.label}</span>)}</div>
  </div>;
}

function TrendPlot({ data, max, color, variant, gradientId }: { data: TimePoint[]; max: number; color: string; variant: "line" | "area"; gradientId: string }) {
  const width = 320;
  const height = 124;
  const top = 14;
  const bottom = 112;
  const coordinates = data.map((point, index) => ({
    x: 6 + (index / Math.max(1, data.length - 1)) * (width - 12),
    y: bottom - (point.value / max) * (bottom - top),
  }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = coordinates.length ? `M ${coordinates[0]!.x} ${bottom} L ${coordinates.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${coordinates.at(-1)!.x} ${bottom} Z` : "";

  return <div aria-hidden="true">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full overflow-visible">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
      {[0.25, 0.5, 0.75, 1].map((position) => <line key={position} x1="0" y1={bottom * position} x2={width} y2={bottom * position} stroke="var(--color-border)" strokeWidth="1" />)}
      {variant === "area" ? <path d={area} fill={`url(#${gradientId})`} /> : null}
      <polyline points={line} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {coordinates.map((point, index) => <g key={`${point.x}-${index}`}>
        <circle cx={point.x} cy={point.y} r="3.5" fill="white" stroke={color} strokeWidth="2.5" />
        {data.length <= 7 && data[index]!.value > 0 ? <text x={point.x} y={Math.max(9, point.y - 9)} textAnchor="middle" fill="var(--color-muted)" fontSize="9" fontWeight="800">{formatValue(data[index]!.value)}</text> : null}
      </g>)}
    </svg>
    <div className="flex">{data.map((point, index) => <span key={`${point.label}-axis-${index}`} className="min-w-0 flex-1 text-center text-[9px] font-semibold text-[var(--color-muted)]">{showAxisLabel(index, data.length) ? point.label : ""}</span>)}</div>
  </div>;
}
