"use client";

import type { ActivityDto } from "./activity.dto";
import { ActivityMediaGallery } from "./activity-media-preview";
import { useActivitySaveQueue } from "./activity-save-queue";
import { AlertTriangleIcon, CloudIcon, PlayIcon } from "@/components/icons";
import { openStorageManager } from "@/modules/integrations/storage/storage-manager";

export function useActivityMediaSyncState(activity: ActivityDto) {
  const { mediaJobs, recoveryReady, retryActivityMedia } = useActivitySaveQueue();
  const localJob = mediaJobs[activity.id];
  const serverStatus = activity.mediaSyncStatus ?? "synced";
  const missingLocalJob = recoveryReady && !localJob && (serverStatus === "pending" || serverStatus === "uploading");
  const status = missingLocalJob ? "failed" : localJob?.status ?? serverStatus;
  const kinds = localJob?.kinds ?? activity.media.map((item) => item.kind);
  return {
    status,
    kinds,
    expectedCount: localJob?.expectedCount ?? activity.mediaSyncExpectedCount ?? activity.media.length,
    failure: localJob?.failure,
    hasLocalJob: Boolean(localJob),
    recoveryReady,
    retry: () => retryActivityMedia(activity.id),
  };
}

function mediaNoun(kinds: readonly ("image" | "video")[]) {
  const hasImage = kinds.includes("image");
  const hasVideo = kinds.includes("video");
  if (hasImage && hasVideo) return "ảnh và video";
  if (hasVideo) return "video";
  if (hasImage) return "ảnh";
  return "media";
}

export function ActivityMediaSyncNotice({ activity, compact = false }: { activity: ActivityDto; compact?: boolean }) {
  const sync = useActivityMediaSyncState(activity);
  if (sync.status === "synced") return null;
  const failed = sync.status === "failed";
  const noun = mediaNoun(sync.kinds);
  const label = failed ? "Tải " + noun + " thất bại" : "Đang tải " + noun;
  const description = failed
    ? sync.hasLocalJob
      ? sync.failure?.message ?? "Media vẫn được giữ trên thiết bị. Bạn có thể tải lại."
      : sync.recoveryReady
        ? "Không tìm thấy file gốc trên thiết bị này. Hãy chọn lại trong hoạt động."
        : "Đang kiểm tra media còn chờ trên thiết bị…"
    : "Hoạt động đã được lưu. " + noun.charAt(0).toUpperCase() + noun.slice(1) + " sẽ xuất hiện sau khi đồng bộ xong.";

  return <div
    role={failed ? "alert" : "status"}
    aria-live={failed ? "assertive" : "polite"}
    className={(compact ? "border-t border-[var(--color-border)] px-3.5 py-3" : "rounded-2xl border px-4 py-3") + " " + (failed ? "border-red-200 bg-red-50 text-[var(--color-danger)]" : "border-[#ded5f1] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]")}
  >
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl " + (failed ? "bg-white" : "bg-white/80 opacity-60 motion-safe:animate-pulse")}>
        {failed ? <AlertTriangleIcon className="h-5 w-5" /> : <CloudIcon className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{label}</p>
        {!compact ? <p className="mt-0.5 text-xs font-semibold leading-5 opacity-80">{description}</p> : null}
      </div>
      {failed && sync.hasLocalJob ? <button type="button" onClick={sync.retry} className="min-h-11 shrink-0 rounded-xl bg-white px-3 text-xs font-extrabold shadow-sm transition-colors hover:bg-red-100 active:bg-red-100">
        Tải media lại
      </button> : null}
    </div>
    {!compact && failed && sync.failure?.storageIssue ? <button
      type="button"
      onClick={(event) => openStorageManager({ reason: sync.failure!.storageIssue!, returnFocus: event.currentTarget })}
      className="mt-3 min-h-11 w-full rounded-xl border border-current bg-white px-3 text-sm font-extrabold transition-opacity hover:opacity-80 active:opacity-70"
    >
      Mở nơi lưu media
    </button> : null}
  </div>;
}

export function ActivityMediaSyncContent({
  activity,
  label,
  maxThumbnails,
  className,
}: {
  activity: ActivityDto;
  label: string;
  maxThumbnails?: number;
  className?: string;
}) {
  const sync = useActivityMediaSyncState(activity);
  if (!activity.media.length && sync.status === "synced") return null;
  const busy = sync.status === "pending" || sync.status === "uploading";
  return <>
    {activity.media.length ? <div className={busy ? "opacity-60 motion-safe:animate-pulse" : undefined}>
      <ActivityMediaGallery media={activity.media} label={label} {...(maxThumbnails === undefined ? {} : { maxThumbnails })} {...(className === undefined ? {} : { className })} />
    </div> : <div aria-hidden="true" className={(className ?? "") + " flex gap-2 " + (busy ? "opacity-60 motion-safe:animate-pulse" : "")}>
      {Array.from({ length: Math.min(3, Math.max(1, sync.expectedCount)) }, (_, index) => <span key={index} className="grid aspect-square w-16 place-items-center rounded-xl bg-[var(--color-border)] text-[var(--color-muted)]"><PlayIcon className="h-5 w-5 opacity-50" /></span>)}
    </div>}
    <ActivityMediaSyncNotice activity={activity} compact />
  </>;
}
