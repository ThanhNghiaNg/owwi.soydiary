"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type BreastSide = "left" | "right";

export type BreastfeedingTimerState = {
  version: 1;
  babyId: string;
  occurredAt: string;
  note: string;
  leftSeconds: number;
  rightSeconds: number;
  activeSide: BreastSide | null;
  lastSide: BreastSide;
  activeSince: number | null;
};

const STORAGE_KEY = "babytrack:breastfeeding-timer:v1";
export const BREASTFEEDING_AUTO_SAVE_PENDING_KEY = "babys-diary:pending-breastfeeding-autosave:v1";
const listeners = new Set<() => void>();
let memoryState: BreastfeedingTimerState | null | undefined;

function isTimerState(value: unknown): value is BreastfeedingTimerState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BreastfeedingTimerState>;
  return candidate.version === 1
    && typeof candidate.babyId === "string"
    && typeof candidate.occurredAt === "string"
    && typeof candidate.note === "string"
    && typeof candidate.leftSeconds === "number"
    && typeof candidate.rightSeconds === "number"
    && (candidate.activeSide === "left" || candidate.activeSide === "right" || candidate.activeSide === null)
    && (candidate.lastSide === "left" || candidate.lastSide === "right")
    && (typeof candidate.activeSince === "number" || candidate.activeSince === null);
}

function readSessionState() {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (isTimerState(parsed)) return parsed;
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Keep the in-memory timer usable when browser storage is unavailable.
    }
  }
  return null;
}

function getSnapshot() {
  if (memoryState === undefined) memoryState = readSessionState();
  return memoryState;
}

function getServerSnapshot() {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: BreastfeedingTimerState | null) {
  memoryState = next;
  if (typeof window !== "undefined") {
    try {
      if (next) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // The timer still works in memory for this mounted app session.
    }
  }
  listeners.forEach((listener) => listener());
}

function settledAt(state: BreastfeedingTimerState, now = Date.now()): BreastfeedingTimerState {
  if (!state.activeSide || state.activeSince === null) return state;
  const elapsed = Math.max(0, Math.floor((now - state.activeSince) / 1000));
  return {
    ...state,
    leftSeconds: state.leftSeconds + (state.activeSide === "left" ? elapsed : 0),
    rightSeconds: state.rightSeconds + (state.activeSide === "right" ? elapsed : 0),
    activeSince: now,
  };
}

export function getBreastfeedingElapsed(state: BreastfeedingTimerState | null, now = Date.now()) {
  if (!state) return { leftSeconds: 0, rightSeconds: 0, totalSeconds: 0 };
  const elapsed = state.activeSide && state.activeSince !== null
    ? Math.max(0, Math.floor((now - state.activeSince) / 1000))
    : 0;
  const leftSeconds = state.leftSeconds + (state.activeSide === "left" ? elapsed : 0);
  const rightSeconds = state.rightSeconds + (state.activeSide === "right" ? elapsed : 0);
  return { leftSeconds, rightSeconds, totalSeconds: leftSeconds + rightSeconds };
}

export function toggleBreastSide(side: BreastSide, draft: { babyId: string; occurredAt: string; note: string }) {
  const now = Date.now();
  const current = getSnapshot();
  if (!current || current.babyId !== draft.babyId) {
    publish({
      version: 1,
      babyId: draft.babyId,
      occurredAt: draft.occurredAt,
      note: draft.note,
      leftSeconds: 0,
      rightSeconds: 0,
      activeSide: side,
      lastSide: side,
      activeSince: now,
    });
    return;
  }

  const settled = settledAt(current, now);
  if (current.activeSide === side) {
    publish({ ...settled, activeSide: null, activeSince: null });
    return;
  }
  publish({ ...settled, activeSide: side, lastSide: side, activeSince: now });
}

export function pauseBreastfeedingTimer() {
  const current = getSnapshot();
  if (!current?.activeSide) return;
  publish({ ...settledAt(current), activeSide: null, activeSince: null });
}

export function updateBreastfeedingDraft(draft: Partial<Pick<BreastfeedingTimerState, "occurredAt" | "note">>) {
  const current = getSnapshot();
  if (!current) return;
  publish({ ...current, ...draft });
}

export function clearBreastfeedingTimer({ preservePendingAutoSave = false }: { preservePendingAutoSave?: boolean } = {}) {
  publish(null);
  if (!preservePendingAutoSave && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(BREASTFEEDING_AUTO_SAVE_PENDING_KEY);
    } catch {
      // The in-memory timer is still cleared when persistent storage is unavailable.
    }
  }
}

export function breastfeedingTimerMutationId(state: Pick<BreastfeedingTimerState, "babyId" | "occurredAt">) {
  return `breastfeeding-autosave:${state.babyId}:${state.occurredAt}`;
}

export function useBreastfeedingTimer() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useTimerNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [running]);
  return now;
}

export function formatTimerDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
