"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PauseIcon, PlayIcon, XIcon } from "./icons";
import { ConfirmDialog } from "./confirm-dialog";
import {
  clearBreastfeedingTimer,
  formatTimerDuration,
  getBreastfeedingElapsed,
  toggleBreastSide,
  useBreastfeedingTimer,
  useTimerNow,
} from "@/modules/activity/breastfeeding-timer";

export function BreastfeedingTimerBar({ aboveAction = false }: { aboveAction?: boolean }) {
  const router = useRouter();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const timer = useBreastfeedingTimer();
  const now = useTimerNow(Boolean(timer?.activeSide));
  const closeCancelDialog = useCallback(() => setCancelDialogOpen(false), []);
  const confirmCancel = useCallback(() => {
    setCancelDialogOpen(false);
    clearBreastfeedingTimer();
  }, []);
  if (!timer) return null;

  const elapsed = getBreastfeedingElapsed(timer, now);
  const activeLabel = timer.activeSide === "left" ? "Đang ghi bên trái" : timer.activeSide === "right" ? "Đang ghi bên phải" : "Đang tạm dừng";
  const draft = { babyId: timer.babyId, occurredAt: timer.occurredAt, note: timer.note };

  return <><aside
    aria-label="Thanh ghi giờ bú mẹ"
    className={`fixed left-1/2 z-40 w-[calc(100%_-_1rem)] max-w-[588px] -translate-x-1/2 rounded-2xl border border-[#d8cdef] bg-white p-3 shadow-[0_12px_36px_rgba(54,38,77,0.2)] ${aboveAction ? "bottom-[calc(5.6rem_+_env(safe-area-inset-bottom))]" : "bottom-[calc(5.25rem_+_env(safe-area-inset-bottom))]"}`}
  >
    <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${timer.activeSide ? "bg-[#2f9c75]" : "bg-[#a39cab]"}`} aria-hidden="true" />
      <button onClick={() => router.push("/app/track/breastfeeding")} className="min-h-12 min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-extrabold text-[var(--color-primary-strong)]">Bú mẹ · {activeLabel}</span>
        <span className="mt-0.5 block text-2xl font-black leading-none tabular-nums tracking-tight">{formatTimerDuration(elapsed.totalSeconds)}</span>
      </button>
      <button onClick={() => setCancelDialogOpen(true)} aria-label="Hủy cữ bú đang ghi" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[var(--color-muted)] transition-colors hover:bg-red-50 hover:text-[var(--color-danger)] active:bg-red-100">
        <XIcon className="h-5 w-5" />
      </button>
    </div>

    <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
      <TimerSideControl side="left" label="Trái" seconds={elapsed.leftSeconds} active={timer.activeSide === "left"} onClick={() => toggleBreastSide("left", draft)} />
      <TimerSideControl side="right" label="Phải" seconds={elapsed.rightSeconds} active={timer.activeSide === "right"} onClick={() => toggleBreastSide("right", draft)} />
      <button onClick={() => router.push("/app/track/breastfeeding")} className="min-h-12 rounded-xl bg-[var(--color-primary-soft)] px-3 text-xs font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[#e1d7f6] active:bg-[#d8caf3]">Mở</button>
    </div>
  </aside><ConfirmDialog
    open={cancelDialogOpen}
    title="Hủy cữ bú đang ghi?"
    description="Toàn bộ thời gian bên trái và bên phải của cữ bú này sẽ bị xóa và không thể khôi phục."
    confirmLabel="Hủy cữ bú"
    cancelLabel="Tiếp tục ghi"
    tone="danger"
    onConfirm={confirmCancel}
    onClose={closeCancelDialog}
  /></>;
}

function TimerSideControl({ side, label, seconds, active, onClick }: { side: "left" | "right"; label: string; seconds: number; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} aria-label={`${active ? "Tạm dừng" : "Ghi giờ"} bên ${side === "left" ? "trái" : "phải"}`} className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-xs font-extrabold transition-colors ${active ? "bg-[var(--color-primary)] text-white" : "bg-[#f4f1f7] text-[var(--color-ink)] hover:bg-[#ebe5f0]"}`}>
    {active ? <PauseIcon className="h-4 w-4 shrink-0" /> : <PlayIcon className="h-4 w-4 shrink-0" />}
    <span>{label}</span>
    <span className="truncate tabular-nums opacity-75">{formatTimerDuration(seconds)}</span>
  </button>;
}
