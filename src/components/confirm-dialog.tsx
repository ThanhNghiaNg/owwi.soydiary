"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangleIcon, XIcon } from "./icons";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  tone?: "danger" | "primary";
  icon?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Quay lại",
  confirmDisabled = false,
  cancelDisabled = false,
  tone = "primary",
  icon,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
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
  }, [onClose, open]);

  if (!open) return null;

  const confirmClass = tone === "danger"
    ? "bg-[var(--color-danger)] text-white hover:bg-[#941f17] active:bg-[#7f1d16]"
    : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] active:bg-[#452b8a]";

  return <div
    className="dialog-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-[#211a2b]/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div
      ref={panelRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="dialog-panel safe-bottom relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-[var(--color-border)] bg-white px-6 pb-6 pt-5 shadow-[0_24px_64px_rgba(31,22,43,0.28)] sm:rounded-[2rem]"
    >
      <button onClick={onClose} disabled={cancelDisabled} aria-label="Đóng hộp thoại" className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-xl text-[var(--color-muted)] transition-colors hover:bg-[#f4f1f7] active:bg-[#eae4ef] disabled:cursor-not-allowed disabled:opacity-50">
        <XIcon className="h-5 w-5" />
      </button>

      <div className={`grid h-12 w-12 place-items-center rounded-2xl ${tone === "danger" ? "bg-red-50 text-[var(--color-danger)]" : "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"}`} aria-hidden="true">
        {icon ?? <AlertTriangleIcon className="h-6 w-6" />}
      </div>
      <h2 id={titleId} className="mt-5 pr-10 text-2xl font-black tracking-tight">{title}</h2>
      <p id={descriptionId} aria-live="polite" className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{description}</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button ref={cancelRef} onClick={onClose} disabled={cancelDisabled} className="min-h-12 rounded-2xl border border-[var(--color-border)] bg-white px-4 font-extrabold text-[var(--color-ink)] transition-colors hover:bg-[#f7f5f9] active:bg-[#eeeaf2] disabled:cursor-not-allowed disabled:opacity-50">{cancelLabel}</button>
        <button onClick={onConfirm} disabled={confirmDisabled} className={`min-h-12 rounded-2xl px-4 font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}
