"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { CalendarIcon, ChevronDown, ChevronLeft, XIcon } from "@/components/icons";
import { formatClock } from "@/lib/date";
import { ActivityAsset } from "@/modules/activity/activity-asset";
import { ActivityMediaSyncContent } from "@/modules/activity/activity-media-sync-status";
import { activityDetail, formatActivityDuration } from "@/modules/activity/activity-format";
import type { ActivityDto, ActivityType } from "@/modules/activity/activity.dto";
import { ACTIVITY_REGISTRY, getActivityMeta } from "@/modules/activity/activity.registry";
import {
  buildHistorySummary,
  formatRangeLabel,
  groupActivitiesByDay,
  makeHistoryRange,
  rangeToIso,
  type HistoryRange,
} from "./history";
import { type ActivitiesResponse } from "@/lib/swr";

type HistoryTab = "timeline" | "summary";
const quickActivityOrder: ActivityType[] = ["breastfeeding", "diaper", "pump", "bottle", "moment", "sleep", "tummy", "solid", "custom"];
const quickActivities = quickActivityOrder.map((type) => ACTIVITY_REGISTRY.find((item) => item.type === type)!);
const emptyActivities: ActivityDto[] = [];

export function HistoryScreen() {
  const [tab, setTab] = useState<HistoryTab>("timeline");
  const [range, setRange] = useState<HistoryRange>(() => makeHistoryRange("today"));
  const [rangeOpen, setRangeOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const activitiesKey = useMemo(() => {
    const { from, to } = rangeToIso(range);
    const params = new URLSearchParams({ from, to, limit: "1000" });
    return `/api/activities?${params}`;
  }, [range]);
  const { data: response, error, isLoading, mutate } = useSWR<ActivitiesResponse>(activitiesKey);
  const activities = response?.activities ?? emptyActivities;

  const timelineGroups = useMemo(() => groupActivitiesByDay(activities.slice(0, visibleCount)), [activities, visibleCount]);
  const summary = useMemo(() => buildHistorySummary(activities, range), [activities, range]);
  const closeRange = useCallback(() => setRangeOpen(false), []);
  const applyRange = useCallback((next: HistoryRange) => {
    setVisibleCount(50);
    setRange(next);
    setRangeOpen(false);
  }, []);

  return <div className="app-page overscroll-contain">
    <header className="rounded-b-[2rem] bg-[var(--color-primary)] px-3 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <div className="grid grid-cols-[3rem_1fr_3rem] items-center">
        <Link href="/app" aria-label="Quay về Hôm nay" className="grid h-12 w-12 place-items-center rounded-2xl transition-colors hover:bg-white/15 active:bg-white/20">
          <ChevronLeft className="h-7 w-7" />
        </Link>
        <div className="text-center">
          <p className="text-xs font-bold text-white/70">Nhật ký của bé</p>
          <h1 className="text-xl font-extrabold tracking-tight">Lịch sử</h1>
        </div>
        <button onClick={() => setRangeOpen(true)} aria-label="Chọn khoảng ngày" className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 transition-colors hover:bg-white/20 active:bg-white/25">
          <CalendarIcon className="h-6 w-6" />
        </button>
      </div>
    </header>

    <main className="px-4 py-5 sm:px-6">
      <section aria-labelledby="history-quick-track-title">
        <div>
          <h2 id="history-quick-track-title" className="text-lg font-extrabold tracking-tight">Ghi nhanh</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Chạm để ghi một hoạt động mới</p>
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:-mx-6 sm:px-6">
          {quickActivities.map((item) => <Link
              key={item.type}
              href={`/app/track/${item.type}?from=history`}
              aria-label={`Ghi hoạt động ${item.label}`}
              className="group min-w-[76px] touch-manipulation snap-start rounded-2xl border border-[var(--color-border)] bg-white px-2 py-2.5 text-center shadow-[0_3px_12px_rgba(58,43,76,0.04)] transition duration-200 hover:border-[var(--color-primary)] hover:shadow-[0_5px_16px_rgba(58,43,76,0.08)] active:bg-[var(--color-primary-soft)]"
            >
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: `${item.accent}18` }}>
                <ActivityAsset type={item.type} size={38} className="h-9 w-9" />
              </span>
              <span className="mt-1.5 block truncate text-xs font-extrabold text-[var(--color-ink)] group-hover:text-[var(--color-primary-strong)]">{item.shortLabel}</span>
            </Link>)}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 rounded-2xl border border-[var(--color-border)] bg-white p-1" role="tablist" aria-label="Chế độ xem lịch sử">
        <button id="history-tab-timeline" aria-controls="history-panel" role="tab" aria-selected={tab === "timeline"} onClick={() => setTab("timeline")} className={`min-h-11 rounded-xl px-3 text-sm font-extrabold transition-colors ${tab === "timeline" ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" : "text-[var(--color-muted)] hover:bg-[#f7f5f9]"}`}>Dòng thời gian</button>
        <button id="history-tab-summary" aria-controls="history-panel" role="tab" aria-selected={tab === "summary"} onClick={() => setTab("summary")} className={`min-h-11 rounded-xl px-3 text-sm font-extrabold transition-colors ${tab === "summary" ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" : "text-[var(--color-muted)] hover:bg-[#f7f5f9]"}`}>Tổng hợp</button>
      </div>

      <button onClick={() => setRangeOpen(true)} className="mt-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-[#f0ecf6] px-4 text-left transition-colors hover:bg-[#e7e0ef]">
        <span className="min-w-0">
          <span className="block text-xs font-bold text-[var(--color-muted)]">Khoảng thời gian</span>
          <span className="block truncate text-sm font-extrabold capitalize">{formatRangeLabel(range)}</span>
        </span>
        <CalendarIcon className="h-6 w-6 shrink-0 text-[var(--color-primary-strong)]" />
      </button>

      {error ? <div role="alert" className="mt-4 flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--color-danger)]"><p className="min-w-0 flex-1">Chưa thể tải lịch sử. Bạn thử lại sau nhé.</p><button onClick={() => { void mutate(); }} className="min-h-11 shrink-0 rounded-xl bg-white px-3 font-extrabold shadow-sm">Thử lại</button></div> : null}
      {isLoading && activities.length === 0 ? <HistorySkeleton /> : null}

      <div id="history-panel" role="tabpanel" aria-labelledby={tab === "timeline" ? "history-tab-timeline" : "history-tab-summary"}>
      {!isLoading || activities.length > 0 ? tab === "timeline"
        ? <Timeline groups={timelineGroups} hasMore={activities.length > visibleCount} onLoadMore={() => setVisibleCount((count) => count + 50)} />
        : <Summary sections={summary} />
      : null}
      </div>
    </main>

    {rangeOpen ? <DateRangeDialog range={range} onClose={closeRange} onApply={applyRange} /> : null}
  </div>;
}

function Timeline({ groups, hasMore, onLoadMore }: { groups: ReturnType<typeof groupActivitiesByDay>; hasMore: boolean; onLoadMore: () => void }) {
  if (!groups.length) return <EmptyState title="Chưa có hoạt động" description="Thử chọn khoảng ngày khác hoặc ghi một hoạt động mới cho bé." />;
  return <div className="mt-5 space-y-6">
    {groups.map((group) => <section key={group.key} aria-labelledby={`day-${group.key}`}>
      <h2 id={`day-${group.key}`} className="mb-3 text-sm font-extrabold capitalize text-[var(--color-muted)]">{group.label}</h2>
      <div className="space-y-3">
        {group.activities.map((activity) => {
          const meta = getActivityMeta(activity.type);
          return <article key={activity.id} className="surface-card relative overflow-hidden transition duration-200 hover:border-[var(--color-primary)] focus-within:border-[var(--color-primary)]">
          <Link href={`/app/activity/${activity.id}?from=history`} aria-label={`Xem và sửa ${meta.label} lúc ${formatClock(activity.occurredAt)}`} className="group flex min-h-[92px] transition-colors active:bg-[var(--color-primary-soft)]">
            <span className="w-1.5 shrink-0" style={{ backgroundColor: meta.accent }} aria-hidden="true" />
            <div className="grid w-[76px] shrink-0 place-items-center" style={{ backgroundColor: `${meta.accent}12` }}>
              <ActivityAsset type={activity.type} size={52} className="h-12 w-12" />
            </div>
            <div className="min-w-0 flex-1 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-extrabold">{meta.label}</h3>
                  <time className="mt-1 block text-xl font-black tabular-nums tracking-tight">{formatClock(activity.occurredAt)}</time>
                </div>
                <span className="max-w-[50%] rounded-full bg-[#f2eff5] px-3 py-1.5 text-right text-xs font-extrabold text-[var(--color-muted)]">{activityDetail(activity)}</span>
              </div>
              {activityBreakdown(activity) ? <p className="mt-2 text-xs font-semibold leading-5 text-[var(--color-muted)]">{activityBreakdown(activity)}</p> : null}
              {activity.note ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-muted)]">{activity.note}</p> : null}
            </div>
          </Link>
          <ActivityMediaSyncContent
            activity={activity}
            label={`Ảnh và video của ${meta.label} lúc ${formatClock(activity.occurredAt)}`}
            maxThumbnails={1}
            className="border-t border-[var(--color-border)] px-4 py-3"
          />
          </article>;
        })}
      </div>
    </section>)}
    {hasMore ? <button onClick={onLoadMore} className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-[var(--color-border)] bg-white px-4 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)]">Xem thêm hoạt động</button> : null}
  </div>;
}

function activityBreakdown(activity: ActivityDto) {
  if (activity.type === "breastfeeding") return `Trái ${formatActivityDuration(activity.leftSeconds)} · Phải ${formatActivityDuration(activity.rightSeconds)}`;
  if (activity.type === "pump") return `Trái ${activity.leftMl} ml · Phải ${activity.rightMl} ml`;
  if (activity.type === "bottle") return { "breast-milk": "Sữa mẹ", formula: "Sữa công thức", other: "Loại sữa khác" }[activity.milkType];
  if (activity.type === "sleep") return `Thức lúc ${formatClock(activity.endedAt)}`;
  return "";
}

function Summary({ sections }: { sections: ReturnType<typeof buildHistorySummary> }) {
  if (!sections.length) return <EmptyState title="Chưa có dữ liệu tổng hợp" description="Thử chọn khoảng ngày khác hoặc ghi thêm hoạt động cho bé." />;
  return <div className="mt-5 space-y-4">
    {sections.map((section) => <details key={section.key} open className="group surface-card overflow-hidden">
      <summary className="flex min-h-16 list-none items-center gap-3 px-5 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: section.accent }} aria-hidden="true" />
        <h2 className="flex-1 text-lg font-black tracking-tight">{section.title}</h2>
        <ChevronDown className="h-5 w-5 text-[var(--color-muted)] transition-transform group-open:rotate-180" />
      </summary>
      <dl className="border-t border-[var(--color-border)] px-5 pb-5 pt-2">
        {section.rows.map((row) => <div key={row.label} className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5 ${row.divider ? "mt-1 border-t border-[var(--color-border)] pt-4" : ""}`}>
          <dt className="text-sm leading-5 text-[var(--color-muted)]">{row.label}</dt>
          <dd className="text-right text-sm font-black text-[var(--color-ink)]">{row.value}</dd>
        </div>)}
      </dl>
    </details>)}
  </div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="surface-card mt-5 px-6 py-9 text-center">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"><CalendarIcon className="h-7 w-7" /></span>
    <h2 className="mt-4 font-extrabold">{title}</h2>
    <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-[var(--color-muted)]">{description}</p>
  </div>;
}

function HistorySkeleton() {
  return <div role="status" aria-label="Đang tải lịch sử" className="mt-5 space-y-3">
    {[0, 1, 2].map((item) => <div key={item} className="surface-card flex h-24 animate-pulse overflow-hidden"><span className="w-20 bg-[#eee9f2]" /><span className="m-4 flex-1 rounded-xl bg-[#eee9f2]" /></div>)}
  </div>;
}

function DateRangeDialog({ range, onClose, onApply }: { range: HistoryRange; onClose: () => void; onApply: (range: HistoryRange) => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);
  const valid = Boolean(start && end && start <= end);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => firstRef.current?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  const selectPreset = useCallback((preset: "today" | "yesterday" | "7-days" | "30-days") => onApply(makeHistoryRange(preset)), [onApply]);
  return <div className="dialog-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-[#211a2b]/55 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog-panel safe-bottom relative max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-[var(--color-border)] bg-[var(--color-canvas)] px-5 pb-6 pt-5 shadow-[0_24px_64px_rgba(31,22,43,0.28)] sm:rounded-[2rem]">
      <button ref={firstRef} onClick={onClose} aria-label="Đóng chọn khoảng ngày" className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-xl text-[var(--color-muted)] hover:bg-white"><XIcon className="h-5 w-5" /></button>
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-primary)]">Lịch sử</p>
      <h2 id={titleId} className="mt-1 pr-12 text-2xl font-black tracking-tight">Chọn khoảng thời gian</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Xem nhanh theo mốc có sẵn hoặc chọn ngày tùy ý.</p>

      <div className="surface-card mt-5 grid grid-cols-2 gap-3 p-4">
        <label className="min-w-0 text-sm font-extrabold">Từ ngày<input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} className="field-control mt-2 min-w-0 px-3 text-base" /></label>
        <label className="min-w-0 text-sm font-extrabold">Đến ngày<input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} className="field-control mt-2 min-w-0 px-3 text-base" /></label>
        <button disabled={!valid} onClick={() => onApply({ preset: "custom", start, end })} className="primary-button col-span-2 mt-1 w-full">Áp dụng khoảng ngày</button>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-extrabold text-[var(--color-muted)]">Chọn nhanh</h3>
      <div className="surface-card divide-y divide-[var(--color-border)] overflow-hidden">
        {([[
          "today", "Hôm nay"], ["yesterday", "Hôm qua"], ["7-days", "7 ngày gần nhất"], ["30-days", "30 ngày gần nhất"],
        ] as const).map(([preset, label]) => <button key={preset} onClick={() => selectPreset(preset)} className="flex min-h-14 w-full items-center justify-between px-4 text-left font-extrabold text-[var(--color-primary-strong)] hover:bg-[var(--color-primary-soft)]"><span>{label}</span><ChevronLeft className="h-5 w-5 rotate-180" /></button>)}
      </div>
    </div>
  </div>;
}
