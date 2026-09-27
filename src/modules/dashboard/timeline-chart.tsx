"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { ActivityDto } from "@/modules/activity/activity.dto";
import { activityDetail } from "@/modules/activity/activity-format";
import { ACTIVITY_REGISTRY, getActivityMeta } from "@/modules/activity/activity.registry";

export type TimelineDayCount = 7 | 14;

type TimelineSegment = {
  id: string;
  activity: ActivityDto;
  activityStart: number;
  activityEnd: number;
  visibleStart: number;
  visibleEnd: number;
  dayStart: number;
};

type TimelineDay = {
  start: number;
  segments: TimelineSegment[];
  height: number;
};

type Scrubber = {
  dayIndex: number;
  minute: number;
};

const DAY_MINUTES = 24 * 60;
const AXIS_HEIGHT = 38;
const BASE_ROW_HEIGHT = 56;
const SEGMENT_HEIGHT = 18;
const AXIS_TICKS = [0, 4, 8, 12, 16, 20, 24] as const;
const timeFormatter = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
const fullDateFormatter = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });

function startOfDay(date: Date) {
  const output = new Date(date);
  output.setHours(0, 0, 0, 0);
  return output;
}

function addDays(date: Date, days: number) {
  const output = new Date(date);
  output.setDate(output.getDate() + days);
  return output;
}

function activityEnd(activity: ActivityDto, start: number) {
  if (activity.type === "sleep") return Math.max(start, new Date(activity.endedAt).getTime());
  if (activity.type === "breastfeeding") return start + (activity.leftSeconds + activity.rightSeconds) * 1_000;
  if (activity.type === "tummy") return start + activity.durationMinutes * 60_000;
  return start;
}

function buildTimeline(activities: ActivityDto[], dayCount: TimelineDayCount): TimelineDay[] {
  const today = startOfDay(new Date());
  const firstDay = addDays(today, -(dayCount - 1));
  const days = Array.from({ length: dayCount }, (_, index) => ({
    start: addDays(firstDay, index).getTime(),
    segments: [] as TimelineSegment[],
    height: BASE_ROW_HEIGHT,
  }));

  for (const activity of activities) {
    const start = new Date(activity.occurredAt).getTime();
    if (!Number.isFinite(start)) continue;
    const end = activityEnd(activity, start);

    days.forEach((day) => {
      const dayEnd = addDays(new Date(day.start), 1).getTime();
      const isInstantOnDay = end === start && start >= day.start && start < dayEnd;
      const overlapsDay = end > start && start < dayEnd && end > day.start;
      if (!isInstantOnDay && !overlapsDay) return;
      day.segments.push({
        id: `${activity.id}-${day.start}`,
        activity,
        activityStart: start,
        activityEnd: end,
        visibleStart: Math.max(start, day.start),
        visibleEnd: Math.min(Math.max(end, start), dayEnd),
        dayStart: day.start,
      });
    });
  }

  days.forEach((day) => {
    day.segments.sort((a, b) => a.visibleStart - b.visibleStart);
  });
  return days;
}

function dayName(date: Date) {
  return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getDay()] ?? "";
}

function shortDate(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function segmentPosition(segment: TimelineSegment): CSSProperties {
  const dayEnd = addDays(new Date(segment.dayStart), 1).getTime();
  const dayLength = dayEnd - segment.dayStart;
  const left = ((segment.visibleStart - segment.dayStart) / dayLength) * 100;
  const duration = Math.max(0, segment.visibleEnd - segment.visibleStart);
  const width = (duration / dayLength) * 100;
  return {
    left: `${left}%`,
    width: duration > 0 ? `${width}%` : "1px",
  };
}

function segmentTop(day: TimelineDay) {
  return (day.height - SEGMENT_HEIGHT) / 2;
}

function segmentDuration(segment: TimelineSegment) {
  return Math.max(0, segment.visibleEnd - segment.visibleStart);
}

function stackedSegments(day: TimelineDay) {
  return [...day.segments].sort((a, b) => (
    segmentDuration(b) - segmentDuration(a)
    || a.visibleStart - b.visibleStart
    || a.id.localeCompare(b.id)
  ));
}

function describeSegment(segment: TimelineSegment) {
  const meta = getActivityMeta(segment.activity.type);
  const start = new Date(segment.activityStart);
  const hasDuration = segment.activityEnd > segment.activityStart;
  const end = new Date(segment.activityEnd);
  const crossesDate = start.toDateString() !== end.toDateString();
  return {
    meta,
    title: meta.label,
    time: hasDuration
      ? crossesDate
        ? `Bắt đầu ${fullDateFormatter.format(start)} lúc ${timeFormatter.format(start)} · Kết thúc ${fullDateFormatter.format(end)} lúc ${timeFormatter.format(end)}`
        : `Bắt đầu ${fullDateFormatter.format(start)} lúc ${timeFormatter.format(start)} · Kết thúc ${timeFormatter.format(end)}`
      : `Bắt đầu ${fullDateFormatter.format(start)} lúc ${timeFormatter.format(start)}`,
    detail: activityDetail(segment.activity),
  };
}

function segmentAriaLabel(segment: TimelineSegment) {
  const description = describeSegment(segment);
  return `${description.title}, ${description.time}, ${description.detail}`;
}

function SegmentTooltip({ segment }: { segment: TimelineSegment }) {
  const description = describeSegment(segment);
  return <div className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 shadow-[0_10px_28px_rgba(50,38,68,0.16)]">
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 truncate text-xs font-black">{description.title}</p>
      <p className="shrink-0 text-[11px] font-extrabold text-[var(--color-muted)]">{description.detail}</p>
    </div>
    <p className="mt-1 text-[10px] font-semibold leading-4 text-[var(--color-muted)]">{description.time}</p>
    <span className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ backgroundColor: description.meta.accent }} aria-hidden="true" />
  </div>;
}

export function ActivityTimelineChart({
  activities,
  dayCount,
  onDayCountChange,
}: {
  activities: ActivityDto[];
  dayCount: TimelineDayCount;
  onDayCountChange: (value: TimelineDayCount) => void;
}) {
  const days = useMemo(() => buildTimeline(activities, dayCount), [activities, dayCount]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrubber, setScrubber] = useState<Scrubber | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const latestPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const allSegments = useMemo(() => days.flatMap((day) => day.segments), [days]);
  const dayOffsets = useMemo(() => days.map((_, index, items) => (
    items.slice(0, index).reduce((sum, day) => sum + day.height, 0)
  )), [days]);
  const activeSegment = allSegments.find((segment) => segment.id === (hoveredId ?? selectedId));
  const presentTypes = useMemo(() => new Set(allSegments.map((segment) => segment.activity.type)), [allSegments]);
  const legend = ACTIVITY_REGISTRY.filter((item) => presentTypes.has(item.type));
  const interactionId = hoveredId ?? selectedId;
  const activeDayIndex = activeSegment ? days.findIndex((day) => day.start === activeSegment.dayStart) : -1;
  const activeDay = activeDayIndex >= 0 ? days[activeDayIndex] : undefined;
  const activeDayEnd = activeDay ? addDays(new Date(activeDay.start), 1).getTime() : 0;
  const activeCenter = activeSegment && activeDay
    ? ((activeSegment.visibleStart + activeSegment.visibleEnd) / 2 - activeDay.start) / (activeDayEnd - activeDay.start) * 100
    : 0;
  const activeTooltipTop = activeSegment && activeDay
    ? AXIS_HEIGHT + (dayOffsets[activeDayIndex] ?? 0) + segmentTop(activeDay) + (activeDayIndex === 0 ? SEGMENT_HEIGHT + 8 : -8)
    : 0;

  useEffect(() => () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
  }, []);

  function clearHoldTimer() {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }

  function updateScrubber(clientX: number, clientY: number) {
    const plot = plotRef.current;
    if (!plot) return;
    const rect = plot.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const minute = Math.min(DAY_MINUTES - 1, Math.round((ratio * (DAY_MINUTES - 1)) / 5) * 5);
    const relativeY = clientY - rect.top - AXIS_HEIGHT;
    let dayIndex = 0;
    let rowOffset = Math.max(0, relativeY);
    for (let index = 0; index < days.length; index += 1) {
      dayIndex = index;
      const height = days[index]?.height ?? BASE_ROW_HEIGHT;
      if (rowOffset < height) break;
      rowOffset -= height;
    }
    setScrubber({ dayIndex, minute });
    setHoveredId(null);
  }

  function scheduleScrubber(clientX: number, clientY: number) {
    latestPointerRef.current = { x: clientX, y: clientY };
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const latest = latestPointerRef.current;
      if (latest) updateScrubber(latest.x, latest.y);
    });
  }

  function startPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    clearHoldTimer();
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    const currentTarget = event.currentTarget;
    const pointerId = event.pointerId;
    const clientX = event.clientX;
    const clientY = event.clientY;
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setScrubbing(true);
      updateScrubber(clientX, clientY);
      try {
        currentTarget.setPointerCapture(pointerId);
      } catch {
        // Pointer capture is best-effort on older mobile browsers.
      }
    }, event.pointerType === "mouse" ? 140 : 350);
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (scrubbing) {
      event.preventDefault();
      scheduleScrubber(event.clientX, event.clientY);
      return;
    }
    const start = pointerStartRef.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clearHoldTimer();
  }

  function endPointer() {
    clearHoldTimer();
    pointerStartRef.current = null;
    if (scrubbing) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    setScrubbing(false);
  }

  function handleKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    setScrubber((current) => {
      const base = current ?? { dayIndex: days.length - 1, minute: 12 * 60 };
      if (event.key === "Home") return { ...base, minute: 0 };
      if (event.key === "End") return { ...base, minute: DAY_MINUTES - 1 };
      const delta = event.key === "ArrowLeft" ? -15 : 15;
      return { ...base, minute: Math.min(DAY_MINUTES - 1, Math.max(0, base.minute + delta)) };
    });
  }

  function changeDayCount(value: TimelineDayCount) {
    setHoveredId(null);
    setSelectedId(null);
    setScrubber(null);
    onDayCountChange(value);
  }

  function selectNearestSegment(event: ReactMouseEvent<HTMLDivElement>, day: TimelineDay) {
    if (suppressClickRef.current || !day.segments.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    const dayEnd = addDays(new Date(day.start), 1).getTime();
    const dayLength = dayEnd - day.start;
    const nearest = day.segments.reduce<{ segment: TimelineSegment; distance: number } | null>((current, segment) => {
      const startX = ((segment.visibleStart - day.start) / dayLength) * rect.width;
      const endX = ((segment.visibleEnd - day.start) / dayLength) * rect.width;
      const isInstant = segment.visibleEnd <= segment.visibleStart;
      const distanceX = isInstant
        ? Math.abs(x - startX)
        : x < startX
          ? startX - x
          : x > endX
            ? x - endX
            : 0;
      const centerY = segmentTop(day) + SEGMENT_HEIGHT / 2;
      const distance = Math.hypot(distanceX, y - centerY);
      if (!current || distance < current.distance) return { segment, distance };
      if (Math.abs(distance - current.distance) < 0.5 && segmentDuration(segment) < segmentDuration(current.segment)) {
        return { segment, distance };
      }
      return current;
    }, null);

    if (nearest?.distance !== undefined && nearest.distance <= 24) {
      setScrubber(null);
      setSelectedId((current) => current === nearest.segment.id ? null : nearest.segment.id);
    }
  }

  const scrubberLeft = scrubber ? (scrubber.minute / (DAY_MINUTES - 1)) * 100 : 0;
  const hasActivities = allSegments.length > 0;

  return <section className="surface-card mt-4 overflow-hidden p-5" style={{ borderRadius: "18px" }} aria-labelledby="activity-timeline-title">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 pt-1">
        <h2 id="activity-timeline-title" className="text-xl font-black tracking-tight">Biểu đồ theo thời gian</h2>
        <p className="mt-0.5 text-sm font-bold text-[var(--color-muted)]">{dayCount} ngày gần nhất</p>
      </div>
      <div className="grid shrink-0 grid-cols-2 rounded-xl bg-[#f3eff8] p-1" role="group" aria-label="Số ngày trên biểu đồ">
        {([7, 14] as const).map((value) => <button
          key={value}
          type="button"
          aria-pressed={dayCount === value}
          onClick={() => changeDayCount(value)}
          className={`min-h-11 rounded-lg px-3 text-sm font-extrabold transition-colors ${dayCount === value ? "bg-[var(--color-primary)] text-white shadow-[0_4px_12px_rgba(82,53,158,0.18)]" : "text-[var(--color-muted)] hover:text-[var(--color-primary-strong)]"}`}
        >{value} ngày</button>)}
      </div>
    </div>

    <div className="mt-6 flex min-w-0" aria-label={`Dòng thời gian hoạt động trong ${dayCount} ngày gần nhất`}>
      <div className="w-12 shrink-0 pt-[38px]" aria-hidden="true">
        {days.map((day) => {
          const date = new Date(day.start);
          return <div key={day.start} className="flex flex-col justify-center border-b border-[var(--color-border)] pr-2 last:border-b-0" style={{ height: `${day.height}px` }}>
            <span className="text-xs font-black">{dayName(date)}</span>
            <span className="text-[10px] font-bold tabular-nums text-[var(--color-muted)]">{shortDate(date)}</span>
          </div>;
        })}
      </div>

      <div
        ref={plotRef}
        className={`relative min-w-0 flex-1 select-none outline-none ${scrubbing ? "cursor-ew-resize" : "cursor-crosshair"}`}
        style={{ touchAction: scrubbing ? "none" : "pan-y" }}
        tabIndex={0}
        role="group"
        aria-label="Biểu đồ thời gian. Nhấn giữ và kéo để xem giờ, hoặc dùng phím mũi tên trái phải."
        onKeyDown={handleKeyboard}
        onPointerDown={startPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="relative flex h-[38px] items-start text-[10px] font-extrabold tabular-nums text-[var(--color-muted)] sm:text-[11px]" aria-hidden="true">
          {AXIS_TICKS.map((hour, index) => <span
            key={hour}
            className="absolute top-0"
            style={{ left: `${(hour / 24) * 100}%`, transform: index === 0 ? "none" : index === AXIS_TICKS.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
          >{hour === 24 ? "23:59" : `${String(hour).padStart(2, "0")}:00`}</span>)}
        </div>

        <div className="relative overflow-hidden rounded-lg">
          {days.map((day) => <div
            key={day.start}
            className="relative border-b border-[var(--color-border)] bg-white last:border-b-0"
            style={{ height: `${day.height}px` }}
            onClick={(event) => selectNearestSegment(event, day)}
          >
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              {Array.from({ length: 25 }, (_, hour) => <span
                key={hour}
                className={`absolute inset-y-0 border-l ${hour % 4 === 0 ? "border-dashed border-[#dcd4e8]" : "border-[#f0ecf5]"}`}
                style={{ left: `${(hour / 24) * 100}%` }}
              />)}
            </div>
            {stackedSegments(day).map((segment) => {
              const meta = getActivityMeta(segment.activity.type);
              const selected = selectedId === segment.id;
              const instant = segment.visibleEnd <= segment.visibleStart;
              return <button
                key={segment.id}
                type="button"
                aria-pressed={selected}
                aria-label={segmentAriaLabel(segment)}
                onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredId(segment.id); }}
                onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoveredId(null); }}
                onFocus={() => setHoveredId(segment.id)}
                onBlur={() => setHoveredId(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (suppressClickRef.current) return;
                  setScrubber(null);
                  setSelectedId((current) => current === segment.id ? null : segment.id);
                }}
                className={`group absolute block min-w-[3px] rounded-md p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 ${interactionId === segment.id ? "z-30" : "z-10"}`}
                style={{ ...segmentPosition(segment), top: `${segmentTop(day)}px`, height: `${SEGMENT_HEIGHT}px` }}
              >
                {instant
                  ? <span
                    className={`absolute left-1/2 top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_2px_7px_rgba(39,35,49,0.14)] transition-[filter,transform] group-hover:brightness-95 group-active:scale-y-90 ${selected ? "ring-2 ring-[var(--color-ink)] ring-offset-1" : ""}`}
                    style={{ background: `color-mix(in srgb, ${meta.accent} 82%, white)` }}
                    aria-hidden="true"
                  />
                  : <span
                    className={`block h-full min-w-[3px] w-full rounded-md shadow-[0_2px_7px_rgba(39,35,49,0.09)] transition-[filter,transform] group-hover:brightness-95 group-active:scale-y-90 ${selected ? "ring-2 ring-[var(--color-ink)] ring-offset-1" : ""}`}
                    style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${meta.accent} 68%, white), color-mix(in srgb, ${meta.accent} 84%, white))` }}
                    aria-hidden="true"
                  />}
              </button>;
            })}
          </div>)}
        </div>

        {scrubber ? <div className="pointer-events-none absolute bottom-0 z-40 w-px bg-[var(--color-primary-strong)] shadow-[0_0_0_1px_rgba(255,255,255,0.8)]" style={{ left: `${scrubberLeft}%`, top: `${AXIS_HEIGHT}px` }} aria-hidden="true">
          <span
            className="absolute h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-[var(--color-primary-strong)] shadow-sm"
            style={{ top: `${(dayOffsets[scrubber.dayIndex] ?? 0) + (days[scrubber.dayIndex]?.height ?? BASE_ROW_HEIGHT) / 2 - 6}px` }}
          />
        </div> : null}

        {activeSegment && activeDay && !scrubber ? <div
          className="pointer-events-none absolute z-50 w-56 -translate-x-1/2"
          style={{
            left: `clamp(112px, ${activeCenter}%, calc(100% - 112px))`,
            top: `${activeTooltipTop}px`,
            transform: activeDayIndex === 0 ? "translateX(-50%)" : "translate(-50%, -100%)",
          }}
          aria-live="polite"
        ><SegmentTooltip segment={activeSegment} /></div> : null}

        {scrubber ? <div
          className="pointer-events-none absolute z-50 -translate-x-1/2 rounded-lg bg-[var(--color-primary-strong)] px-3 py-1.5 text-center text-white shadow-lg"
          style={{
            left: `clamp(52px, ${scrubberLeft}%, calc(100% - 52px))`,
            top: `${AXIS_HEIGHT + (dayOffsets[scrubber.dayIndex] ?? 0) + 5}px`,
          }}
          aria-live="polite"
        >
          <p className="text-sm font-black tabular-nums">{String(Math.floor(scrubber.minute / 60)).padStart(2, "0")}:{String(scrubber.minute % 60).padStart(2, "0")}</p>
          <p className="text-[9px] font-bold text-white/75">{dayName(new Date(days[scrubber.dayIndex]?.start ?? 0))}, {shortDate(new Date(days[scrubber.dayIndex]?.start ?? 0))}</p>
        </div> : null}
      </div>
    </div>

    {!hasActivities ? <p className="mt-3 rounded-lg bg-[#f7f5f9] px-3 py-2 text-center text-xs font-semibold text-[var(--color-muted)]">Chưa có hoạt động trong {dayCount} ngày gần nhất.</p> : null}

    {legend.length ? <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto rounded-xl bg-[#f7f4fb] px-4 py-4" aria-label="Chú thích màu hoạt động">
      {legend.map((item) => <span key={item.type} className="inline-flex shrink-0 items-center gap-2 text-xs font-extrabold text-[var(--color-muted)]">
        <span className="h-6 w-6 rounded-lg shadow-sm" style={{ background: `color-mix(in srgb, ${item.accent} 78%, white)` }} aria-hidden="true" />
        {item.label}
      </span>)}
    </div> : null}
  </section>;
}

export function timelineStartIso(dayCount: TimelineDayCount, now = new Date()) {
  return addDays(startOfDay(now), -(dayCount - 1)).toISOString();
}

export function timelineEndIso(now = new Date()) {
  return new Date(addDays(startOfDay(now), 1).getTime() - 1).toISOString();
}
