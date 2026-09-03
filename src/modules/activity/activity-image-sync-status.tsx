"use client";

import type { ActivityDto } from "./activity.dto";
import { ActivityImageGallery } from "./activity-image-preview";
import { useActivitySaveQueue } from "./activity-save-queue";
import { AlertTriangleIcon, CloudIcon } from "@/components/icons";
import { openStorageManager } from "@/modules/integrations/storage/storage-manager";

export function useActivityImageSyncState(activity: ActivityDto) {
  const { imageJobs, recoveryReady, retryActivityImages } = useActivitySaveQueue();
  const localJob = imageJobs[activity.id];
  const serverStatus = activity.imageSyncStatus ?? "synced";
  const missingLocalJob = recoveryReady
    && !localJob
    && (serverStatus === "pending" || serverStatus === "uploading");
  const status = missingLocalJob ? "failed" : localJob?.status ?? serverStatus;
  return {
    status,
    failure: localJob?.failure,
    hasLocalJob: Boolean(localJob),
    recoveryReady,
    retry: () => retryActivityImages(activity.id),
  };
}

export function ActivityImageSyncNotice({ activity, compact = false }: { activity: ActivityDto; compact?: boolean }) {
  const sync = useActivityImageSyncState(activity);
  if (sync.status === "synced") return null;
  const failed = sync.status === "failed";
  const label = failed ? "Tải ảnh thất bại" : "Đang tải ảnh";
  const description = failed
    ? sync.hasLocalJob
      ? sync.failure?.message ?? "Ảnh vẫn được giữ trên thiết bị. Bạn có thể tải lại."
      : sync.recoveryReady
        ? "Không tìm thấy ảnh gốc trên thiết bị này. Hãy chọn lại ảnh trong hoạt động."
        : "Đang kiểm tra ảnh còn chờ trên thiết bị…"
    : "Hoạt động đã được lưu. Ảnh sẽ xuất hiện sau khi đồng bộ xong.";

  return <div
    role={failed ? "alert" : "status"}
    aria-live={failed ? "assertive" : "polite"}
    className={`${compact ? "border-t border-[var(--color-border)] px-3.5 py-3" : "rounded-2xl border px-4 py-3"} ${failed ? "border-red-200 bg-red-50 text-[var(--color-danger)]" : "border-[#ded5f1] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"}`}
  >
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${failed ? "bg-white" : "bg-white/80 opacity-60 motion-safe:animate-pulse"}`}>
        {failed ? <AlertTriangleIcon className="h-5 w-5" /> : <CloudIcon className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{label}</p>
        {!compact ? <p className="mt-0.5 text-xs font-semibold leading-5 opacity-80">{description}</p> : null}
      </div>
      {failed && sync.hasLocalJob ? <button
        type="button"
        onClick={sync.retry}
        className="min-h-11 shrink-0 rounded-xl bg-white px-3 text-xs font-extrabold shadow-sm transition-colors hover:bg-red-100 active:bg-red-100"
      >
        Tải ảnh lại
      </button> : null}
    </div>
    {!compact && failed && sync.failure?.storageIssue ? <button
      type="button"
      onClick={(event) => openStorageManager({ reason: sync.failure!.storageIssue!, returnFocus: event.currentTarget })}
      className="mt-3 min-h-11 w-full rounded-xl border border-current bg-white px-3 text-sm font-extrabold transition-opacity hover:opacity-80 active:opacity-70"
    >
      Mở nơi lưu ảnh
    </button> : null}
  </div>;
}

export function ActivityImageSyncMedia({
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
  const sync = useActivityImageSyncState(activity);
  if (!activity.images.length && sync.status === "synced") return null;
  const busy = sync.status === "pending" || sync.status === "uploading";

  return <>
    {activity.images.length ? <div className={busy ? "opacity-60 motion-safe:animate-pulse" : undefined}>
      <ActivityImageGallery
        images={activity.images}
        label={label}
        {...(maxThumbnails === undefined ? {} : { maxThumbnails })}
        {...(className === undefined ? {} : { className })}
      />
    </div> : <div aria-hidden="true" className={`${className ?? ""} flex gap-2 ${busy ? "opacity-60 motion-safe:animate-pulse" : ""}`}>
      {Array.from({ length: Math.min(3, Math.max(1, activity.imageSyncExpectedCount ?? 1)) }, (_, index) => <span key={index} className="aspect-square w-16 rounded-xl bg-[var(--color-border)]" />)}
    </div>}
    <ActivityImageSyncNotice activity={activity} compact />
  </>;
}
