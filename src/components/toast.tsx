"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangleIcon, CheckIcon, XIcon } from "./icons";

export type ToastTone = "success" | "error" | "info";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  /** Set to 0 when the caller needs a toast to stay until it is dismissed. */
  duration?: number;
  action?: ToastAction;
};

type Toast = Required<Pick<ToastOptions, "message">> & {
  id: string;
  tone: ToastTone;
  duration: number;
  action?: ToastAction;
};

type ToastListener = (toast: Toast) => void;

const listeners = new Set<ToastListener>();
const pendingToasts: Toast[] = [];
let toastSequence = 0;

function makeToast(options: ToastOptions): Toast {
  const tone = options.tone ?? "info";
  return {
    id: `toast-${Date.now()}-${++toastSequence}`,
    message: options.message,
    tone,
    duration: options.duration ?? (tone === "error" ? 8000 : 4000),
    ...(options.action ? { action: options.action } : {}),
  };
}

/**
 * Shows an app-wide, non-blocking notification. Safe to call from any client
 * component, including work which outlives the screen that started it.
 */
export function showToast(options: ToastOptions) {
  const toast = makeToast(options);
  if (!listeners.size) {
    pendingToasts.push(toast);
    if (pendingToasts.length > 3) pendingToasts.shift();
    return toast.id;
  }
  listeners.forEach((listener) => listener(toast));
  return toast.id;
}

function subscribeToasts(listener: ToastListener) {
  listeners.add(listener);
  while (pendingToasts.length) {
    const toast = pendingToasts.shift();
    if (toast) listener(toast);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => subscribeToasts((toast) => {
    setToasts((current) => [...current.slice(-2), toast]);
  }), []);

  if (!toasts.length) return null;

  return <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-full max-w-[620px] flex-col gap-2 px-4 sm:px-6" aria-label="Thông báo">
    {toasts.map((toast) => <ToastMessage key={toast.id} toast={toast} dismiss={dismiss} />)}
  </div>;
}

function ToastMessage({ toast, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.duration <= 0) return;
    const timeout = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timeout);
  }, [dismiss, toast.duration, toast.id]);

  const styles = toast.tone === "error"
    ? "border-red-200 bg-red-50 text-[var(--color-danger)]"
    : toast.tone === "success"
      ? "border-[#b9e4dc] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
      : "border-[var(--color-primary-soft)] bg-white text-[var(--color-ink)]";
  const Icon = toast.tone === "error" ? AlertTriangleIcon : CheckIcon;

  return <div
    role={toast.tone === "error" ? "alert" : "status"}
    aria-live={toast.tone === "error" ? "assertive" : "polite"}
    aria-atomic="true"
    className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-[0_10px_28px_rgba(46,36,59,0.16)] ${styles}`}
  >
    <span aria-hidden="true" className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center">
      <Icon className="h-5 w-5" />
    </span>
    <p className="min-w-0 flex-1 text-sm font-bold leading-5">{toast.message}</p>
    {toast.action ? <button
      type="button"
      onClick={() => {
        dismiss(toast.id);
        toast.action?.onClick();
      }}
      className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-extrabold underline underline-offset-2 transition-opacity hover:opacity-75 active:opacity-60"
    >{toast.action.label}</button> : null}
    <button
      type="button"
      onClick={() => dismiss(toast.id)}
      aria-label="Đóng thông báo"
      className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors hover:bg-black/5 active:bg-black/10"
    >
      <XIcon className="h-5 w-5" />
    </button>
  </div>;
}
