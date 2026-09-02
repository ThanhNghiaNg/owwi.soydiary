"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, XIcon } from "@/components/icons";

export type PreviewableActivityImage = {
  url: string;
  storageKey: string;
};

type ActivityImagePreviewProps = {
  images: readonly PreviewableActivityImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

/**
 * Full-screen, keyboard-accessible viewer shared by editable and read-only
 * activity galleries. Mount this component only while the preview is open.
 */
export function ActivityImagePreview({ images, index, onIndexChange, onClose }: ActivityImagePreviewProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const onIndexChangeRef = useRef(onIndexChange);
  const imagesLengthRef = useRef(images.length);
  const indexRef = useRef(index);

  useEffect(() => {
    onCloseRef.current = onClose;
    onIndexChangeRef.current = onIndexChange;
    imagesLengthRef.current = images.length;
    indexRef.current = index;
  }, [images.length, index, onClose, onIndexChange]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      const imageCount = imagesLengthRef.current;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (imageCount > 1 && event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChangeRef.current((indexRef.current - 1 + imageCount) % imageCount);
        return;
      }

      if (imageCount > 1 && event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChangeRef.current((indexRef.current + 1) % imageCount);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
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

  const safeIndex = Math.min(Math.max(index, 0), Math.max(images.length - 1, 0));
  const image = images[safeIndex];
  if (!image) return null;
  if (typeof document === "undefined") return null;

  const hasMultiple = images.length > 1;
  const positionLabel = `Ảnh ${safeIndex + 1} trên ${images.length}`;

  return createPortal(<div
    className="fixed inset-0 z-[80] flex min-h-dvh items-center justify-center bg-[#17121d]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="flex h-full max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/15 bg-[#211a2b] shadow-2xl"
    >
      <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-4">
        <div className="min-w-0 px-1 text-white">
          <h2 id={titleId} className="truncate text-base font-extrabold">Xem hình ảnh hoạt động</h2>
          <p id={descriptionId} aria-live="polite" className="mt-0.5 text-xs font-semibold text-white/70">{positionLabel}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Đóng xem hình ảnh"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <XIcon className="h-6 w-6" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-5"
        onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      >
        <figure className="flex max-h-full max-w-full items-center justify-center">
          {/* Blob URLs and authenticated Drive routes cannot use Next Image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={`${positionLabel} của hoạt động`}
            className="max-h-full max-w-full select-none object-contain"
          />
          <figcaption className="sr-only">{positionLabel} của hoạt động nhật ký</figcaption>
        </figure>

        {hasMultiple ? <>
          <button
            type="button"
            onClick={() => onIndexChange((safeIndex - 1 + images.length) % images.length)}
            aria-label="Xem ảnh trước"
            className="absolute left-2 grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/80 active:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-4"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => onIndexChange((safeIndex + 1) % images.length)}
            aria-label="Xem ảnh tiếp theo"
            className="absolute right-2 grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/80 active:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-4"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </> : null}
      </div>
    </div>
  </div>, document.body);
}

type ActivityImageGalleryProps = {
  images: readonly PreviewableActivityImage[];
  label?: string;
  maxThumbnails?: number;
  className?: string;
};

/** Compact read-only gallery for activity cards and detail surfaces. */
export function ActivityImageGallery({
  images,
  label = "Hình ảnh hoạt động",
  maxThumbnails = 4,
  className = "",
}: ActivityImageGalleryProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  if (!images.length) return null;

  const visibleImages = images.slice(0, Math.max(1, maxThumbnails));
  const hiddenCount = Math.max(0, images.length - visibleImages.length);

  return <>
    <div role="list" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {visibleImages.map((image, index) => {
        const isOverflowThumbnail = hiddenCount > 0 && index === visibleImages.length - 1;
        return <div key={image.storageKey} role="listitem" className="shrink-0">
          <button
            type="button"
            onClick={() => setPreviewIndex(index)}
            aria-label={isOverflowThumbnail
              ? `Xem ảnh ${index + 1} và ${hiddenCount} ảnh khác`
              : `Xem ảnh hoạt động ${index + 1} trên ${images.length}`}
            className="group/image relative block h-16 w-16 touch-manipulation overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#f2eff5] shadow-sm transition hover:border-[var(--color-primary)] active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={`Ảnh ${index + 1} của hoạt động`} className="h-full w-full object-cover transition-transform duration-200 group-hover/image:scale-[1.03] motion-reduce:transition-none" loading="lazy" />
            {isOverflowThumbnail ? <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/65 text-sm font-black text-white">+{hiddenCount}</span> : null}
          </button>
        </div>;
      })}
    </div>
    {previewIndex !== null ? <ActivityImagePreview
      images={images}
      index={previewIndex}
      onIndexChange={setPreviewIndex}
      onClose={() => setPreviewIndex(null)}
    /> : null}
  </>;
}
