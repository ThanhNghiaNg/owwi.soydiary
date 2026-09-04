"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWRInfinite from "swr/infinite";
import {
  ArrowUpRightIcon,
  GalleryIcon,
  GridIcon,
  NoteIcon,
  TimelineIcon,
} from "@/components/icons";
import { formatClock } from "@/lib/date";
import { GALLERY_REFRESH_EVENT } from "@/lib/swr";
import { ActivityAsset } from "@/modules/activity/activity-asset";
import { activityDetail } from "@/modules/activity/activity-format";
import { ActivityMediaSyncNotice } from "@/modules/activity/activity-media-sync-status";
import {
  ActivityMediaGallery,
  ActivityMediaPreview,
  ActivityMediaThumbnail,
  type PreviewableActivityMedia,
} from "@/modules/activity/activity-media-preview";
import type { ActivityDto, ActivityType } from "@/modules/activity/activity.dto";
import { ACTIVITY_REGISTRY, getActivityMeta } from "@/modules/activity/activity.registry";
import {
  GALLERY_PAGE_SIZE,
  type GalleryFilter,
  type GalleryPage,
} from "./gallery.types";

type GalleryView = "grid" | "timeline";

type CollectionMedia = PreviewableActivityMedia & {
  activityId: string;
  activityType: ActivityType;
  occurredAt: string;
  mediaIndex: number;
  mediaSyncStatus: ActivityDto["mediaSyncStatus"];
};

const numberFormatter = new Intl.NumberFormat("vi-VN");
const shortDateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
const monthFormatter = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const previewDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function localDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localMonthKey(value: string) {
  return localDateKey(value).slice(0, 7);
}

function formatDayHeading(value: string) {
  const date = new Date(value);
  const key = localDateKey(value);
  const today = localDateKey(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateKey(yesterdayDate.toISOString());
  if (key === today) return `Hôm nay, ${dayFormatter.format(date)}`;
  if (key === yesterday) return `Hôm qua, ${dayFormatter.format(date)}`;
  return dayFormatter.format(date);
}

function galleryActivityDetail(activity: ActivityDto) {
  if (activity.type === "moment") return activity.note.trim() ? "Có mô tả" : "Khoảnh khắc";
  return activityDetail(activity);
}

function previewMediaForActivity(activity: ActivityDto): CollectionMedia[] {
  const meta = getActivityMeta(activity.type);
  const previewMeta = `${previewDateFormatter.format(new Date(activity.occurredAt))} · ${galleryActivityDetail(activity)}`;
  return activity.media.map((item, mediaIndex) => ({
    ...item,
    activityId: activity.id,
    activityType: activity.type,
    occurredAt: activity.occurredAt,
    mediaIndex,
    mediaSyncStatus: activity.mediaSyncStatus,
    title: meta.label,
    meta: previewMeta,
    description: activity.note,
    alt: `${item.kind === "video" ? "Video" : "Ảnh"} ${mediaIndex + 1} của ${meta.label} lúc ${formatClock(activity.occurredAt)}`,
    activityHref: `/app/activity/${activity.id}?from=gallery`,
  }));
}

function galleryKey(filter: GalleryFilter, pageIndex: number, previousPage: GalleryPage | null) {
  if (previousPage && !previousPage.nextCursor) return null;
  const parameters = new URLSearchParams({ limit: String(GALLERY_PAGE_SIZE) });
  if (filter !== "all") parameters.set("type", filter);
  if (pageIndex > 0 && previousPage?.nextCursor) parameters.set("cursor", previousPage.nextCursor);
  return `/api/gallery?${parameters}`;
}

export function GalleryScreen() {
  const [view, setView] = useState<GalleryView>("grid");
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const { data, error, isLoading, isValidating, mutate, setSize, size } = useSWRInfinite<GalleryPage>(
    (pageIndex, previousPage) => galleryKey(filter, pageIndex, previousPage),
    { revalidateFirstPage: true },
  );

  useEffect(() => {
    function refreshGallery() {
      void mutate();
    }
    window.addEventListener(GALLERY_REFRESH_EVENT, refreshGallery);
    return () => window.removeEventListener(GALLERY_REFRESH_EVENT, refreshGallery);
  }, [mutate]);

  const activities = useMemo(() => {
    const unique = new Map<string, ActivityDto>();
    data?.forEach((page) => page.activities.forEach((activity) => unique.set(activity.id, activity)));
    return [...unique.values()].sort((left, right) => {
      const timeDifference = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
      return timeDifference || right.id.localeCompare(left.id);
    });
  }, [data]);
  const media = useMemo(() => activities.flatMap(previewMediaForActivity), [activities]);
  const summary = data?.[0]?.summary;
  const lastPage = data?.at(-1);
  const hasMore = Boolean(lastPage?.nextCursor);
  const loadingMore = isValidating && Boolean(data) && size > (data?.length ?? 0);
  const selectedFilterLabel = filter === "all" ? "Tất cả hoạt động" : getActivityMeta(filter).label;

  function changeView(nextView: GalleryView) {
    setView(nextView);
    setPreviewIndex(null);
  }

  function changeFilter(nextFilter: GalleryFilter) {
    setPreviewIndex(null);
    void setSize(1);
    setFilter(nextFilter);
  }

  return <main className="px-4 py-5 sm:px-6">
    <section className="overflow-hidden rounded-3xl bg-[var(--color-primary-soft)] p-5" aria-labelledby="gallery-overview-title">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-[var(--color-primary-strong)] shadow-sm" aria-hidden="true">
          <GalleryIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--color-primary-strong)]">Media của bé</p>
          <h1 id="gallery-overview-title" className="mt-1 text-2xl font-black tracking-tight">
            {summary ? `${numberFormatter.format(summary.mediaCount)} ảnh và video` : "Những điều đáng nhớ"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
            {summary
              ? `Được lưu từ ${numberFormatter.format(summary.activityCount)} hoạt động có media.`
              : "Ảnh và video từ các hoạt động sẽ được sắp xếp tại đây."}
          </p>
        </div>
      </div>
    </section>

    <section className="surface-card mt-4 p-4" aria-labelledby="gallery-controls-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="gallery-controls-title" className="text-sm font-extrabold">Cách xem bộ sưu tập</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Đổi kiểu xem mà không mất vị trí đã tải.</p>
        </div>
        {isValidating && !loadingMore ? <span role="status" className="shrink-0 text-xs font-bold text-[var(--color-primary-strong)]">Đang cập nhật…</span> : null}
      </div>

      <div role="group" aria-label="Kiểu hiển thị bộ sưu tập" className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-[var(--color-canvas)] p-1">
        <ViewButton selected={view === "grid"} label="Lưới media" icon={<GridIcon className="h-5 w-5" />} onClick={() => changeView("grid")} />
        <ViewButton selected={view === "timeline"} label="Dòng thời gian" icon={<TimelineIcon className="h-5 w-5" />} onClick={() => changeView("timeline")} />
      </div>

      <label htmlFor="gallery-activity-filter" className="mt-4 block text-sm font-extrabold">
        Loại hoạt động
        <select
          id="gallery-activity-filter"
          value={filter}
          onChange={(event) => changeFilter(event.target.value as GalleryFilter)}
          className="field-control mt-2 font-bold"
        >
          <option value="all">Tất cả hoạt động</option>
          {ACTIVITY_REGISTRY.map((activity) => <option key={activity.type} value={activity.type}>{activity.label}</option>)}
        </select>
      </label>
    </section>

    {error ? <div role="alert" className="mt-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">
      <p className="min-w-0 flex-1">Chưa thể tải bộ sưu tập. Media đã lưu vẫn an toàn.</p>
      <button type="button" onClick={() => void mutate()} className="min-h-11 shrink-0 rounded-xl bg-white px-3 font-extrabold shadow-sm transition-colors hover:bg-red-100 active:bg-red-200">Thử lại</button>
    </div> : null}

    {!error && isLoading && !data ? <GallerySkeleton view={view} /> : null}

    {(!error || data) && (!isLoading || data) ? media.length
      ? view === "grid"
        ? <GalleryGrid media={media} onPreview={setPreviewIndex} />
        : <GalleryTimeline activities={activities} />
      : <GalleryEmptyState filter={filter} onReset={() => changeFilter("all")} />
    : null}

    {media.length ? <div className="mt-7 text-center">
      <p role="status" className="text-xs font-semibold text-[var(--color-muted)]">
        Đang hiển thị {numberFormatter.format(media.length)}{summary ? ` / ${numberFormatter.format(summary.mediaCount)}` : ""} media · {selectedFilterLabel}
      </p>
      {hasMore ? <button
        type="button"
        disabled={loadingMore}
        onClick={() => void setSize((currentSize) => currentSize + 1)}
        className="mt-3 min-h-12 w-full rounded-2xl border border-[var(--color-primary)] bg-white px-4 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] active:bg-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)]"
      >
        {loadingMore ? "Đang tải thêm…" : "Xem thêm media"}
      </button> : <p className="mt-2 text-sm font-extrabold text-[var(--color-accent)]">Đã xem toàn bộ bộ sưu tập</p>}
    </div> : null}

    {previewIndex !== null ? <ActivityMediaPreview
      media={media}
      index={previewIndex}
      onIndexChange={setPreviewIndex}
      onClose={() => setPreviewIndex(null)}
    /> : null}
  </main>;
}

function ViewButton({ selected, label, icon, onClick }: { selected: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold transition-colors ${selected ? "bg-white text-[var(--color-primary-strong)] shadow-sm" : "text-[var(--color-muted)] hover:bg-white/70 active:bg-white"}`}
  >
    <span aria-hidden="true">{icon}</span>{label}
  </button>;
}

function GalleryGrid({ media, onPreview }: { media: CollectionMedia[]; onPreview: (index: number) => void }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, CollectionMedia[]>();
    media.forEach((item) => {
      const key = localMonthKey(item.occurredAt);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    });
    return [...grouped.entries()].map(([key, items]) => ({ key, items, title: monthFormatter.format(new Date(items[0]!.occurredAt)) }));
  }, [media]);
  const mediaIndex = new Map(media.map((item, index) => [`${item.activityId}:${item.mediaIndex}`, index]));

  return <div className="mt-6 space-y-7">
    {groups.map((group) => <section key={group.key} aria-labelledby={`gallery-month-${group.key}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={`gallery-month-${group.key}`} className="text-lg font-black capitalize tracking-tight">{group.title}</h2>
        <span className="text-xs font-bold text-[var(--color-muted)]">{numberFormatter.format(group.items.length)} media</span>
      </div>
      <div role="list" aria-label={`Ảnh và video ${group.title}`} className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {group.items.map((item) => {
          const meta = getActivityMeta(item.activityType);
          const globalIndex = mediaIndex.get(`${item.activityId}:${item.mediaIndex}`) ?? 0;
          return <div role="listitem" key={`${item.activityId}:${item.mediaIndex}:${item.storageKey}`}>
            <button
              type="button"
              onClick={() => onPreview(globalIndex)}
              aria-label={`Xem ${item.alt ?? "media hoạt động"}`}
              className={`group/media relative block aspect-square w-full overflow-hidden rounded-xl bg-[var(--color-border)] shadow-sm transition-opacity active:opacity-80 ${item.mediaSyncStatus === "pending" || item.mediaSyncStatus === "uploading" ? "opacity-60 motion-safe:animate-pulse" : ""}`}
            >
              <ActivityMediaThumbnail media={item} alt={item.alt ?? "Media hoạt động"} className="transition-transform duration-200 group-hover/media:scale-[1.03] motion-reduce:transition-none" />
              <time className="absolute left-1.5 top-1.5 rounded-lg bg-black/65 px-1.5 py-1 text-[0.62rem] font-extrabold text-white backdrop-blur-sm" dateTime={item.occurredAt}>
                {shortDateFormatter.format(new Date(item.occurredAt))}
              </time>
              {item.description?.trim() ? <span title="Có ghi chú" className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-[var(--color-primary-strong)] shadow-sm" aria-hidden="true">
                <NoteIcon className="h-3.5 w-3.5" />
              </span> : null}
              <span className="sr-only">{meta.label}</span>
            </button>
          </div>;
        })}
      </div>
    </section>)}
  </div>;
}

function GalleryTimeline({ activities }: { activities: ActivityDto[] }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, ActivityDto[]>();
    activities.forEach((activity) => {
      const key = localDateKey(activity.occurredAt);
      grouped.set(key, [...(grouped.get(key) ?? []), activity]);
    });
    return [...grouped.entries()].map(([key, items]) => ({ key, items, title: formatDayHeading(items[0]!.occurredAt) }));
  }, [activities]);

  return <div className="mt-6 space-y-7">
    {groups.map((group) => <section key={group.key} aria-labelledby={`gallery-day-${group.key}`}>
      <h2 id={`gallery-day-${group.key}`} className="mb-3 text-sm font-extrabold capitalize text-[var(--color-muted)]">{group.title}</h2>
      <div className="space-y-3">
        {group.items.map((activity) => {
          const meta = getActivityMeta(activity.type);
          const previewMedia = previewMediaForActivity(activity);
          return <article key={activity.id} className="surface-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${meta.accent}18` }} aria-hidden="true">
                <ActivityAsset type={activity.type} size={38} className="h-9 w-9" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-black">{meta.label}</h3>
                <p className="mt-0.5 truncate text-xs font-bold text-[var(--color-muted)]">
                  <time dateTime={activity.occurredAt}>{formatClock(activity.occurredAt)}</time> · {galleryActivityDetail(activity)} · {activity.media.length} media
                </p>
              </div>
              <Link href={`/app/activity/${activity.id}?from=gallery`} aria-label={`Xem hoạt động ${meta.label} lúc ${formatClock(activity.occurredAt)}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] active:bg-[var(--color-primary-soft)]">
                Chi tiết <span aria-hidden="true"><ArrowUpRightIcon className="h-4 w-4" /></span>
              </Link>
            </div>
            <div className="p-4">
              {activity.note.trim() ? <p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink)]">{activity.note}</p> : <p className="mb-3 text-xs italic text-[var(--color-muted)]">Hoạt động này không có ghi chú.</p>}
              <div className={activity.mediaSyncStatus === "pending" || activity.mediaSyncStatus === "uploading" ? "opacity-60 motion-safe:animate-pulse" : undefined}>
                <ActivityMediaGallery media={previewMedia} maxThumbnails={4} label={`Ảnh và video của ${meta.label} lúc ${formatClock(activity.occurredAt)}`} />
              </div>
              <div className="mt-3"><ActivityMediaSyncNotice activity={activity} compact /></div>
            </div>
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}

function GalleryEmptyState({ filter, onReset }: { filter: GalleryFilter; onReset: () => void }) {
  const label = filter === "all" ? "nhật ký" : getActivityMeta(filter).label.toLocaleLowerCase("vi-VN");
  return <div className="surface-card mt-6 px-6 py-10 text-center">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" aria-hidden="true"><GalleryIcon className="h-7 w-7" /></span>
    <h2 className="mt-4 text-lg font-black">Chưa có ảnh hoặc video</h2>
    <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-[var(--color-muted)]">Chưa tìm thấy media trong {label}. Ảnh và video sẽ xuất hiện sau khi bạn lưu hoạt động.</p>
    {filter !== "all" ? <button type="button" onClick={onReset} className="mt-4 min-h-11 rounded-xl px-4 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] active:bg-[var(--color-primary-soft)]">Xem tất cả hoạt động</button> : null}
  </div>;
}

function GallerySkeleton({ view }: { view: GalleryView }) {
  if (view === "timeline") return <div role="status" aria-label="Đang tải dòng thời gian media" className="mt-6 space-y-3">
    {[0, 1, 2].map((item) => <div key={item} className="surface-card h-40 animate-pulse bg-[var(--color-border)] motion-reduce:animate-none" />)}
  </div>;
  return <div role="status" aria-label="Đang tải lưới media" className="mt-6 grid grid-cols-3 gap-1.5 sm:gap-2">
    {Array.from({ length: 9 }, (_, index) => <span key={index} className="aspect-square animate-pulse rounded-xl bg-[var(--color-border)] motion-reduce:animate-none" />)}
  </div>;
}
