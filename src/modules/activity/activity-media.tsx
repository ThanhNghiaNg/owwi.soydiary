"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CameraIcon, GalleryIcon, PlayIcon, TrashIcon } from "@/components/icons";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_ACTIVITY_MEDIA,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "@/modules/integrations/storage/storage.constants";
import { ActivityMediaPreview, ActivityMediaThumbnail, formatMediaDuration } from "./activity-media-preview";
import type { ActivityMedia as StoredActivityMedia } from "./activity.dto";
import type { ActivitySaveMedia } from "./activity-save-draft";
import { mediaKindForMimeType } from "./activity-media-upload";

export type ActivityMedia = StoredActivityMedia;
export type PendingActivityMedia = ActivitySaveMedia;

const inputAccept = [...ACCEPTED_IMAGE_MIME_TYPES, ...ACCEPTED_VIDEO_MIME_TYPES].join(",");

function inspectVideo(url: string) {
  return new Promise<Pick<ActivityMedia, "durationMs" | "width" | "height">>((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    let timeout = 0;
    const finish = (fallback?: Pick<ActivityMedia, "durationMs" | "width" | "height">) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      const metadata = fallback ?? {
        ...(Number.isFinite(video.duration) ? { durationMs: Math.max(0, Math.round(video.duration * 1000)) } : {}),
        ...(video.videoWidth ? { width: video.videoWidth } : {}),
        ...(video.videoHeight ? { height: video.videoHeight } : {}),
      };
      video.removeAttribute("src");
      video.load();
      resolve(metadata);
    };
    timeout = window.setTimeout(() => finish({}), 5_000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish();
    video.onerror = () => finish({});
    video.src = url;
  });
}

function EditorMediaThumbnail({ item, index }: { item: PendingActivityMedia; index: number }) {
  if (item.kind === "video" && item.url.startsWith("blob:")) {
    return <div className="relative h-full w-full bg-[#2b2236]">
      <video src={item.url} muted playsInline preload="metadata" aria-hidden="true" className="h-full w-full object-cover" />
      <span className="absolute inset-0 grid place-items-center bg-black/15 text-white" aria-hidden="true"><span className="grid h-11 w-11 place-items-center rounded-full bg-black/65"><PlayIcon className="ml-0.5 h-5 w-5" /></span></span>
      {item.file?.name ? <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-3.5rem)] truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[0.62rem] font-bold text-white" title={item.file.name}>{item.file.name}</span> : null}
      {item.durationMs !== undefined ? <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.62rem] font-extrabold tabular-nums text-white">{formatMediaDuration(item.durationMs)}</span> : null}
    </div>;
  }
  return <ActivityMediaThumbnail media={item} alt={`${item.kind === "video" ? "Video" : "Ảnh"} ${index + 1} của hoạt động`} />;
}

export function ActivityMediaPicker({ media, onChange, disabled }: {
  media: PendingActivityMedia[];
  onChange: (media: PendingActivityMedia[]) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const libraryRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const objectUrlsRef = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const objectUrls = objectUrlsRef.current;
    return () => {
      mountedRef.current = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  useEffect(() => {
    const activeUrls = new Set(media.filter((item) => item.file).map((item) => item.url));
    media.forEach((item) => {
      if (item.file && item.url.startsWith("blob:")) objectUrlsRef.current.add(item.url);
    });
    objectUrlsRef.current.forEach((url) => {
      if (!activeUrls.has(url)) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      }
    });
  }, [media]);

  async function addFiles(files: FileList | null, input: HTMLInputElement | null) {
    if (!files?.length || processing) return;
    if (input) input.value = "";
    setError("");
    setProcessing(true);
    const available = MAX_ACTIVITY_MEDIA - media.length;
    const accepted: PendingActivityMedia[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files).slice(0, available)) {
      const kind = mediaKindForMimeType(file.type);
      if (!kind) { errors.push("Chỉ hỗ trợ JPG, PNG, WebP, GIF, AVIF, MP4, WebM hoặc MOV."); continue; }
      const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (!file.size || file.size > maxBytes) {
        errors.push(kind === "video" ? "Mỗi video cần nhỏ hơn 100 MB." : "Mỗi ảnh cần nhỏ hơn 8 MB.");
        continue;
      }
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      const metadata = kind === "video" ? await inspectVideo(url) : {};
      accepted.push({ kind, mimeType: file.type, url, storageKey: crypto.randomUUID(), file, ...metadata });
    }
    if (!mountedRef.current) return;
    if (files.length > available) errors.push(`Mỗi hoạt động được thêm tối đa ${MAX_ACTIVITY_MEDIA} ảnh hoặc video.`);
    if (errors.length) setError([...new Set(errors)].join(" "));
    if (accepted.length) onChange([...media, ...accepted]);
    setProcessing(false);
  }

  function remove(index: number) {
    const item = media[index];
    if (item?.file) {
      URL.revokeObjectURL(item.url);
      objectUrlsRef.current.delete(item.url);
    }
    onChange(media.filter((_, current) => current !== index));
    setPreviewIndex((current) => current === null ? null : current === index ? null : current > index ? current - 1 : current);
  }

  const full = media.length >= MAX_ACTIVITY_MEDIA;
  return <section className="surface-card p-4" aria-labelledby={`${inputId}-title`} aria-busy={processing}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 id={`${inputId}-title`} className="text-sm font-extrabold">Ảnh và video</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">Media chỉ được tải lên storage sau khi bạn bấm Lưu.</p>
      </div>
      <span className="shrink-0 text-xs font-bold text-[var(--color-muted)]">{media.length}/{MAX_ACTIVITY_MEDIA}</span>
    </div>
    {media.length ? <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {media.map((item, index) => {
        const typeLabel = item.kind === "video" ? "video" : "ảnh";
        return <div key={item.storageKey} className="relative aspect-square overflow-hidden rounded-2xl bg-[#f2eff5]">
          <button type="button" onClick={() => setPreviewIndex(index)} aria-label={`Xem ${typeLabel} hoạt động ${index + 1} trên ${media.length}`} className="group/media block h-full w-full touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-primary)]">
            <EditorMediaThumbnail item={item} index={index} />
          </button>
          <button type="button" onClick={() => remove(index)} disabled={disabled} aria-label={`Xóa ${typeLabel} ${index + 1}`} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-xl bg-black/65 text-white backdrop-blur-sm disabled:opacity-50"><TrashIcon className="h-5 w-5" /></button>
          {item.file ? <span className="pointer-events-none absolute bottom-1 left-1 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-extrabold text-[var(--color-primary-strong)]">Chờ lưu</span> : null}
        </div>;
      })}
    </div> : <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-[#faf9fb] px-4 py-6 text-center text-sm text-[var(--color-muted)]">Chưa có ảnh hoặc video</div>}

    <input ref={libraryRef} id={inputId} type="file" accept={inputAccept} multiple className="sr-only" onChange={(event) => void addFiles(event.target.files, event.currentTarget)} />
    <input ref={captureRef} type="file" accept="video/*" capture="environment" className="sr-only" onChange={(event) => void addFiles(event.target.files, event.currentTarget)} />
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" disabled={disabled || full || processing} onClick={() => libraryRef.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--color-primary)] px-3 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)]"><span aria-hidden="true"><GalleryIcon className="h-5 w-5" /></span>{processing ? "Đang đọc…" : "Thêm media"}</button>
      <button type="button" disabled={disabled || full || processing} onClick={() => captureRef.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--color-primary)] px-3 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)]"><span aria-hidden="true"><CameraIcon className="h-5 w-5" /></span>Quay video</button>
    </div>
    {error ? <p role="alert" className="mt-2 text-sm font-semibold text-[var(--color-danger)]">{error}</p> : null}
    {previewIndex !== null ? <ActivityMediaPreview media={media} index={previewIndex} onIndexChange={setPreviewIndex} onClose={() => setPreviewIndex(null)} /> : null}
  </section>;
}
