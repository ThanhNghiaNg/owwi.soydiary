"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { TopHeader } from "@/components/top-header";
import { ACTIVITIES_KEY, type ActivitiesResponse } from "@/lib/swr";
import { getActivityMeta } from "@/modules/activity/activity.registry";
import {
  aggregateDashboard,
  dashboardRangeToIso,
  DASHBOARD_PRESETS,
  filterActivitiesForRange,
  makeDashboardRange,
  type DashboardMetricKey,
  type DashboardPreset,
} from "./dashboard";
import { DashboardChart } from "./charts";

const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const emptyActivities: ActivitiesResponse["activities"] = [];

const cardConfigs: ReadonlyArray<{
  key: DashboardMetricKey;
  activityType: Parameters<typeof getActivityMeta>[0];
  title: string;
  unit: string;
}> = [
  { key: "breastfeedingMinutes", activityType: "breastfeeding", title: "Bú mẹ", unit: "phút" },
  { key: "diapers", activityType: "diaper", title: "Thay tã", unit: "lần" },
  { key: "pumpMl", activityType: "pump", title: "Hút sữa", unit: "ml" },
  { key: "bottleMl", activityType: "bottle", title: "Bú bình", unit: "ml" },
  { key: "sleepHours", activityType: "sleep", title: "Giấc ngủ", unit: "giờ" },
  { key: "tummyMinutes", activityType: "tummy", title: "Nằm sấp", unit: "phút" },
  { key: "solidCount", activityType: "solid", title: "Ăn dặm", unit: "bữa" },
  { key: "momentCount", activityType: "moment", title: "Khoảnh khắc", unit: "lần" },
  { key: "customCount", activityType: "custom", title: "Hoạt động khác", unit: "lần" },
];

function formatValue(value: number) {
  return numberFormatter.format(Math.round(value * 10) / 10);
}

export function DashboardScreen() {
  const [preset, setPreset] = useState<DashboardPreset>("7-days");
  const range = useMemo(() => makeDashboardRange(preset), [preset]);
  const { data: cachedResponse } = useSWR<ActivitiesResponse>(ACTIVITIES_KEY);
  const cachedActivities = cachedResponse?.activities ?? emptyActivities;
  const fallbackActivities = useMemo(() => filterActivitiesForRange(cachedActivities, range), [cachedActivities, range]);
  const activitiesKey = useMemo(() => {
    const { from, to } = dashboardRangeToIso(range);
    return `/api/activities?${new URLSearchParams({ from, to, limit: "5000" })}`;
  }, [range]);
  const fallbackData = useMemo<ActivitiesResponse>(() => ({ activities: fallbackActivities }), [fallbackActivities]);
  const { data: response, error, isValidating, mutate } = useSWR<ActivitiesResponse>(activitiesKey, {
    fallbackData,
    revalidateOnMount: true,
  });
  const activities = response?.activities ?? fallbackActivities;
  const data = useMemo(() => aggregateDashboard(activities, range), [activities, range]);

  return <div className="app-page overscroll-contain">
    <TopHeader title="Thống kê" subtitle={`Tổng quan ${range.label.toLocaleLowerCase("vi-VN")}`} />
    <main className="px-4 py-5 sm:px-6">
      <section aria-labelledby="dashboard-range-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="dashboard-range-title" className="text-lg font-extrabold tracking-tight">Khoảng thời gian</h2>
            <p className="mt-0.5 text-xs font-medium text-[var(--color-muted)]">Chọn mốc để xem xu hướng phù hợp</p>
          </div>
          {isValidating ? <span role="status" className="shrink-0 text-xs font-bold text-[var(--color-primary-strong)]">Đang cập nhật…</span> : null}
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:-mx-6 sm:px-6" role="group" aria-label="Chọn khoảng thời gian thống kê">
          {DASHBOARD_PRESETS.map((option) => {
            const selected = preset === option.value;
            return <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setPreset(option.value)}
              className={`min-h-11 shrink-0 snap-start rounded-xl border px-4 text-sm font-extrabold transition duration-200 ${selected ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-[0_5px_16px_rgba(82,53,158,0.18)]" : "border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] active:bg-[var(--color-primary-soft)]"}`}
            >{option.label}</button>;
          })}
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-[var(--color-primary-soft)] p-5" aria-labelledby="dashboard-overview-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--color-primary-strong)]">Nhật ký của bé</p>
            <h2 id="dashboard-overview-title" className="mt-1 text-3xl font-black tabular-nums tracking-tight">{activities.length}</h2>
            <p className="mt-0.5 text-sm font-medium text-[var(--color-muted)]">hoạt động đã ghi</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--color-primary-strong)]">{range.compactLabel}</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] pt-3 text-xs font-bold text-[var(--color-primary-strong)]">
          <span>Dạng hiển thị</span>
          <span className="text-right">{range.chartLabel}</span>
        </div>
      </section>

      {error ? <div role="alert" className="mt-4 flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--color-danger)]"><p className="min-w-0 flex-1">Chưa thể cập nhật số liệu mới nhất.</p><button onClick={() => { void mutate(); }} className="min-h-11 shrink-0 rounded-xl bg-white px-3 font-extrabold shadow-sm">Thử lại</button></div> : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {cardConfigs.map((card) => {
          const series = data[card.key];
          const meta = getActivityMeta(card.activityType);
          const chartUnit = range.granularity === "hourly" ? `${card.unit} / 4 giờ` : `${card.unit} / ngày`;
          const detailUnit = range.granularity === "hourly" ? `${card.unit} / giờ` : chartUnit;
          return <section key={card.key} className="surface-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight">{card.title}</h2>
                <p className="mt-0.5 text-xs font-semibold text-[var(--color-muted)]">{range.chartLabel}</p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ color: meta.accent, backgroundColor: `${meta.accent}14` }}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} aria-hidden="true" />{card.unit}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-[#f7f5f9] p-3">
              <div><p className="text-[11px] font-bold text-[var(--color-muted)]">Tổng cộng</p><p className="mt-0.5 text-xl font-black tabular-nums tracking-tight">{formatValue(series.total)} <span className="text-xs font-extrabold text-[var(--color-muted)]">{card.unit}</span></p></div>
              <div className="border-l border-[var(--color-border)] pl-3"><p className="text-[11px] font-bold text-[var(--color-muted)]">Trung bình/ngày</p><p className="mt-0.5 text-xl font-black tabular-nums tracking-tight">{formatValue(series.averagePerDay)} <span className="text-xs font-extrabold text-[var(--color-muted)]">{card.unit}</span></p></div>
            </div>
            <DashboardChart data={series.points} detailData={series.detailPoints} unit={chartUnit} detailUnit={detailUnit} color={meta.accent} variant={range.chartVariant} rangeLabel={range.label} chartLabel={range.chartLabel} />
          </section>;
        })}
      </div>
    </main>
  </div>;
}
