"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ActivityInput } from "./activity.dto";
import { TrashIcon } from "@/components/icons";
import {
  MAX_ACTIVITY_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_FILES_PER_REQUEST,
} from "@/modules/integrations/storage/storage.constants";
import { ActivityImagePreview } from "./activity-image-preview";

export type ActivityImage = ActivityInput["images"][number];
export type PendingActivityImage = ActivityImage & { file?: File };

export class ActivityImageUploadError extends Error {
  constructor(message: string, readonly images: PendingActivityImage[]) {
    super(message);
    this.name = "ActivityImageUploadError";
  }
}

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export async function uploadPendingActivityImages(images: PendingActivityImage[], folderKey: string) {
  const pending = images.filter((image): image is PendingActivityImage & { file: File } => Boolean(image.file));
  if (!pending.length) return images.map(({ file: _file, ...image }) => image);

  let working = [...images];
  for (let offset = 0; offset < pending.length; offset += MAX_UPLOAD_FILES_PER_REQUEST) {
    const chunk = pending.slice(offset, offset + MAX_UPLOAD_FILES_PER_REQUEST);
    const body = new FormData();
    body.append("keys", JSON.stringify(chunk.map((image) => image.storageKey)));
    body.append("folderKey", folderKey);
    body.append("scope", "activities");
    chunk.forEach((image) => body.append("files", image.file, image.file.name));
    let response: Response;
    try {
      response = await fetch("/api/integrations/storage/upload", { method: "POST", body });
    } catch {
      throw new ActivityImageUploadError("STORAGE_UPLOAD_FAILED", working);
    }
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      uploads?: Array<{
        key: string; secureUrl: string; publicId: string;
        provider?: ActivityImage["provider"]; connectionId: string;
      }>;
      failures?: Array<{ key: string; error: string }>;
    };
    const uploaded = new Map((payload.uploads ?? []).map((item) => [item.key, item]));
    working = working.map((image) => {
      const result = uploaded.get(image.storageKey);
      if (!result) return image;
      return {
        url: result.secureUrl,
        storageKey: result.publicId,
        ...(result.provider ? { provider: result.provider } : {}),
        connectionId: result.connectionId,
      };
    });
    if (!response.ok || payload.failures?.length || uploaded.size !== chunk.length) {
      const code = payload.failures?.[0]?.error ?? payload.error ?? "STORAGE_UPLOAD_FAILED";
      throw new ActivityImageUploadError(code, working);
    }
  }
  return working.map(({ file: _file, ...image }) => image);
}

export function ActivityImages({ images, onChange, disabled }: {
  images: PendingActivityImage[];
  onChange: (images: PendingActivityImage[]) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const objectUrlsRef = useRef(new Set<string>());

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    const activeUrls = new Set(images.filter((image) => image.file).map((image) => image.url));
    objectUrlsRef.current.forEach((url) => {
      if (!activeUrls.has(url)) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      }
    });
  }, [images]);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const available = MAX_ACTIVITY_IMAGES - images.length;
    const accepted: PendingActivityImage[] = [];
    for (const file of Array.from(files).slice(0, available)) {
      if (!ACCEPTED.has(file.type)) { setError("Chỉ hỗ trợ JPG, PNG, WebP, GIF hoặc AVIF."); continue; }
      if (file.size > MAX_IMAGE_BYTES) { setError("Mỗi ảnh cần nhỏ hơn 8 MB."); continue; }
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      accepted.push({ url, storageKey: crypto.randomUUID(), file });
    }
    if (files.length > available) setError(`Mỗi hoạt động được thêm tối đa ${MAX_ACTIVITY_IMAGES} ảnh.`);
    if (accepted.length) onChange([...images, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    const image = images[index];
    if (image?.file) { URL.revokeObjectURL(image.url); objectUrlsRef.current.delete(image.url); }
    onChange(images.filter((_, current) => current !== index));
  }

  return <section className="surface-card p-4" aria-labelledby={`${inputId}-title`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 id={`${inputId}-title`} className="text-sm font-extrabold">Hình ảnh</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">Ảnh chỉ được tải lên storage khi bạn bấm Lưu.</p>
      </div>
      <span className="shrink-0 text-xs font-bold text-[var(--color-muted)]">{images.length}/{MAX_ACTIVITY_IMAGES}</span>
    </div>
    {images.length ? <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {images.map((image, index) => <div key={image.storageKey} className="relative aspect-square overflow-hidden rounded-2xl bg-[#f2eff5]">
        <button type="button" onClick={() => setPreviewIndex(index)} aria-label={`Xem ảnh hoạt động ${index + 1} trên ${images.length}`} className="group/image block h-full w-full touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-primary)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={`Ảnh ${index + 1} của hoạt động`} className="h-full w-full object-cover transition-transform duration-200 group-hover/image:scale-[1.03] motion-reduce:transition-none" loading="lazy" />
        </button>
        <button type="button" onClick={() => remove(index)} disabled={disabled} aria-label={`Xóa ảnh ${index + 1}`} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-xl bg-black/65 text-white backdrop-blur-sm disabled:opacity-50">
          <TrashIcon className="h-5 w-5" />
        </button>
        {image.file ? <span className="pointer-events-none absolute bottom-1 left-1 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-extrabold text-[var(--color-primary-strong)]">Chờ lưu</span> : null}
      </div>)}
    </div> : <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-[#faf9fb] px-4 py-6 text-center text-sm text-[var(--color-muted)]">Chưa có hình ảnh</div>}
    <input ref={inputRef} id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} />
    <button type="button" disabled={disabled || images.length >= MAX_ACTIVITY_IMAGES} onClick={() => inputRef.current?.click()} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-[var(--color-primary)] px-4 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)]">
      Thêm hình ảnh
    </button>
    {error ? <p role="alert" className="mt-2 text-sm font-semibold text-[var(--color-danger)]">{error}</p> : null}
    {previewIndex !== null ? <ActivityImagePreview
      images={images}
      index={previewIndex}
      onIndexChange={setPreviewIndex}
      onClose={() => setPreviewIndex(null)}
    /> : null}
  </section>;
}
