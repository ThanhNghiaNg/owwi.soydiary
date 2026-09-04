"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowUpRightIcon, ChevronLeft, ChevronRight, PlayIcon, XIcon } from "@/components/icons";

export type PreviewableActivityMedia = {
  kind: "image" | "video";
  url: string;
  storageKey: string;
  mimeType: string;
  posterUrl?: string | undefined;
  durationMs?: number | undefined;
  alt?: string;
  title?: string;
  meta?: string;
  description?: string;
  activityHref?: string;
};

export function formatMediaDuration(durationMs?: number) {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return "";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ActivityMediaThumbnail({
  media,
  alt,
  className = "",
}: {
  media: PreviewableActivityMedia;
  alt: string;
  className?: string;
}) {
  if (media.kind === "image") {
    return <>
      {/* Authenticated Drive URLs and blob previews cannot use Next Image optimization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.url} alt={alt} loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />
    </>;
  }
  return <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[#2b2236] text-white">
    {media.posterUrl ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.posterUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className={`absolute inset-0 h-full w-full object-cover ${className}`} />
      <span className="absolute inset-0 bg-black/20" aria-hidden="true" />
    </> : null}
    <span className="relative grid h-11 w-11 place-items-center rounded-full bg-black/65 shadow-lg" aria-hidden="true">
      <PlayIcon className="ml-0.5 h-5 w-5" />
    </span>
    {media.durationMs !== undefined ? <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.62rem] font-extrabold tabular-nums">
      {formatMediaDuration(media.durationMs)}
    </span> : null}
    <span className="sr-only">{alt}</span>
  </div>;
}

type ActivityMediaPreviewProps = {
  media: readonly PreviewableActivityMedia[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

export function ActivityMediaPreview({ media, index, onIndexChange, onClose }: ActivityMediaPreviewProps) {
  const titleId = useId();
  const descriptionId = useId();
  const captionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCloseRef = useRef(onClose);
  const onIndexChangeRef = useRef(onIndexChange);
  const mediaLengthRef = useRef(media.length);
  const indexRef = useRef(index);

  useEffect(() => {
    videoRef.current?.pause();
  }, [index]);

  useEffect(() => {
    onCloseRef.current = onClose;
    onIndexChangeRef.current = onIndexChange;
    mediaLengthRef.current = media.length;
    indexRef.current = index;
  }, [media.length, index, onClose, onIndexChange]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      const count = mediaLengthRef.current;
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (count > 1 && event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChangeRef.current((indexRef.current - 1 + count) % count);
        return;
      }
      if (count > 1 && event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChangeRef.current((indexRef.current + 1) % count);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), video[controls], [href], [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const safeIndex = Math.min(Math.max(index, 0), Math.max(media.length - 1, 0));
  const item = media[safeIndex];
  if (!item || typeof document === "undefined") return null;
  const hasMultiple = media.length > 1;
  const typeLabel = item.kind === "video" ? "Video" : "Ảnh";
  const positionLabel = `${typeLabel} ${safeIndex + 1} trên ${media.length}`;
  const hasDetails = Boolean(item.description?.trim() || item.activityHref);

  return createPortal(<div
    className="fixed inset-0 z-[80] flex min-h-dvh items-center justify-center bg-[#17121d]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={hasDetails ? `${descriptionId} ${captionId}` : descriptionId} className="flex h-full max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/15 bg-[#211a2b] shadow-2xl">
      <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-4">
        <div className="min-w-0 px-1 text-white">
          <h2 id={titleId} className="truncate text-base font-extrabold">{item.title ?? "Xem ảnh và video hoạt động"}</h2>
          <p id={descriptionId} aria-live="polite" className="mt-0.5 truncate text-xs font-semibold text-white/70">{positionLabel}{item.meta ? ` · ${item.meta}` : ""}</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng xem media" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <XIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <figure className="flex max-h-full max-w-full items-center justify-center">
          {item.kind === "video" ? <video
            key={item.storageKey}
            ref={videoRef}
            src={item.url}
            poster={item.posterUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={item.alt ?? positionLabel}
            className="max-h-full max-w-full bg-black object-contain"
          /> : <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={item.alt ?? `${positionLabel} của hoạt động`} className="max-h-full max-w-full select-none object-contain" />
          </>}
          <figcaption className="sr-only">{positionLabel} của hoạt động nhật ký</figcaption>
        </figure>
        {hasMultiple ? <>
          <button type="button" onClick={() => onIndexChange((safeIndex - 1 + media.length) % media.length)} aria-label="Xem media trước" className="absolute left-2 grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/80 active:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-4"><ChevronLeft className="h-7 w-7" /></button>
          <button type="button" onClick={() => onIndexChange((safeIndex + 1) % media.length)} aria-label="Xem media tiếp theo" className="absolute right-2 grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/80 active:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-4"><ChevronRight className="h-7 w-7" /></button>
        </> : null}
      </div>

      {hasDetails ? <div id={captionId} className="safe-bottom flex max-h-[32dvh] shrink-0 items-start gap-4 overflow-y-auto border-t border-white/10 bg-[#211a2b] px-4 py-3 text-white sm:px-5">
        <div className="min-w-0 flex-1">
          {item.description?.trim() ? <><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-white/60">Ghi chú</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-white/90">{item.description}</p></> : <p className="text-sm text-white/65">Hoạt động này không có ghi chú.</p>}
        </div>
        {item.activityHref ? <Link href={item.activityHref} onClick={onClose} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-extrabold transition-colors hover:bg-white/20 active:bg-white/25">Xem hoạt động <span aria-hidden="true"><ArrowUpRightIcon className="h-4 w-4" /></span></Link> : null}
      </div> : null}
    </div>
  </div>, document.body);
}

export function ActivityMediaGallery({
  media,
  label = "Ảnh và video hoạt động",
  maxThumbnails = 4,
  className = "",
}: {
  media: readonly PreviewableActivityMedia[];
  label?: string;
  maxThumbnails?: number;
  className?: string;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  if (!media.length) return null;
  const visibleMedia = media.slice(0, Math.max(1, maxThumbnails));
  const hiddenCount = Math.max(0, media.length - visibleMedia.length);
  return <>
    <div role="list" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {visibleMedia.map((item, index) => {
        const overflow = hiddenCount > 0 && index === visibleMedia.length - 1;
        const typeLabel = item.kind === "video" ? "video" : "ảnh";
        return <div key={item.storageKey} role="listitem" className="shrink-0">
          <button type="button" onClick={() => setPreviewIndex(index)} aria-label={overflow ? `Xem ${typeLabel} ${index + 1} và ${hiddenCount} media khác` : `Xem ${typeLabel} hoạt động ${index + 1} trên ${media.length}`} className="group/media relative block h-16 w-16 touch-manipulation overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#f2eff5] shadow-sm transition hover:border-[var(--color-primary)] active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]">
            <ActivityMediaThumbnail media={item} alt={item.alt ?? `${typeLabel} ${index + 1} của hoạt động`} className="transition-transform duration-200 group-hover/media:scale-[1.03] motion-reduce:transition-none" />
            {overflow ? <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/65 text-sm font-black text-white">+{hiddenCount}</span> : null}
          </button>
        </div>;
      })}
    </div>
    {previewIndex !== null ? <ActivityMediaPreview media={media} index={previewIndex} onIndexChange={setPreviewIndex} onClose={() => setPreviewIndex(null)} /> : null}
  </>;
}
