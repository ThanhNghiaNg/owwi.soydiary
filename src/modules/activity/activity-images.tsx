"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ActivityInput } from "./activity.dto";
import { TrashIcon } from "@/components/icons";

export type ActivityImage = ActivityInput["images"][number];
export type PendingActivityImage = ActivityImage & { file?: File };

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 20;

export async function uploadPendingActivityImages(images: PendingActivityImage[], folderKey: string) {
  const pending = images.filter((image): image is PendingActivityImage & { file: File } => Boolean(image.file));
  if (!pending.length) return images.map(({ url, storageKey }) => ({ url, storageKey }));

  const body = new FormData();
  body.append("keys", JSON.stringify(pending.map((image) => image.storageKey)));
  body.append("folderKey", folderKey);
  body.append("scope", "activities");
  pending.forEach((image) => body.append("files", image.file, image.file.name));
  const response = await fetch("/api/integrations/storage/upload", { method: "POST", body });
  const payload = await response.json().catch(() => ({})) as {
    error?: string; uploads?: Array<{ key: string; secureUrl: string; publicId: string }>;
  };
  if (!response.ok || !payload.uploads || payload.uploads.length !== pending.length) {
    throw new Error(payload.error ?? "STORAGE_UPLOAD_FAILED");
  }
  const uploaded = new Map(payload.uploads.map((item) => [item.key, item]));
  return images.map((image) => {
    if (!image.file) return { url: image.url, storageKey: image.storageKey };
    const result = uploaded.get(image.storageKey);
    if (!result) throw new Error("STORAGE_UPLOAD_FAILED");
    return { url: result.secureUrl, storageKey: result.publicId };
  });
}

export function ActivityImages({ images, onChange, disabled }: {
  images: PendingActivityImage[];
  onChange: (images: PendingActivityImage[]) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const objectUrlsRef = useRef(new Set<string>());

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const available = MAX_IMAGES - images.length;
    const accepted: PendingActivityImage[] = [];
    for (const file of Array.from(files).slice(0, available)) {
      if (!ACCEPTED.has(file.type)) { setError("Chỉ hỗ trợ JPG, PNG, WebP, GIF hoặc AVIF."); continue; }
      if (file.size > MAX_FILE_BYTES) { setError("Mỗi ảnh cần nhỏ hơn 8 MB."); continue; }
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      accepted.push({ url, storageKey: crypto.randomUUID(), file });
    }
    if (files.length > available) setError(`Mỗi hoạt động được thêm tối đa ${MAX_IMAGES} ảnh.`);
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
      <span className="shrink-0 text-xs font-bold text-[var(--color-muted)]">{images.length}/{MAX_IMAGES}</span>
    </div>
    {images.length ? <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {images.map((image, index) => <div key={image.storageKey} className="relative aspect-square overflow-hidden rounded-2xl bg-[#f2eff5]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={`Ảnh hoạt động ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
        <button type="button" onClick={() => remove(index)} disabled={disabled} aria-label={`Xóa ảnh ${index + 1}`} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-xl bg-black/65 text-white backdrop-blur-sm disabled:opacity-50">
          <TrashIcon className="h-5 w-5" />
        </button>
        {image.file ? <span className="absolute bottom-1 left-1 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-extrabold text-[var(--color-primary-strong)]">Chờ lưu</span> : null}
      </div>)}
    </div> : <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-[#faf9fb] px-4 py-6 text-center text-sm text-[var(--color-muted)]">Chưa có hình ảnh</div>}
    <input ref={inputRef} id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} />
    <button type="button" disabled={disabled || images.length >= MAX_IMAGES} onClick={() => inputRef.current?.click()} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-[var(--color-primary)] px-4 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)]">
      Thêm hình ảnh
    </button>
    {error ? <p role="alert" className="mt-2 text-sm font-semibold text-[var(--color-danger)]">{error}</p> : null}
  </section>;
}
