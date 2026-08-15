"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import {
  BREASTFEEDING_AUTO_SAVE_PENDING_KEY,
  breastfeedingTimerMutationId,
  clearBreastfeedingTimer,
  getBreastfeedingElapsed,
  useBreastfeedingTimer,
  type BreastfeedingTimerState,
} from "@/modules/activity/breastfeeding-timer";
import type { ActivityDto } from "@/modules/activity/activity.dto";
import { upsertActivityCaches } from "@/lib/swr";

type AutoSavePayload = {
  type: "breastfeeding";
  occurredAt: string;
  note: string;
  leftSeconds: number;
  rightSeconds: number;
  clientMutationId: string;
};

type PendingAutoSave = {
  babyId: string;
  ownerId: string;
  status: "draft" | "queued";
  updatedAt: number;
  payload: AutoSavePayload;
};

const STALE_DRAFT_AFTER_MS = 4_000;

function makePayload(timer: BreastfeedingTimerState): AutoSavePayload {
  const elapsed = getBreastfeedingElapsed(timer, Date.now());
  const leftSeconds = elapsed.totalSeconds > 0 || timer.activeSide !== "left" ? elapsed.leftSeconds : 1;
  const rightSeconds = elapsed.totalSeconds > 0 || timer.activeSide !== "right" ? elapsed.rightSeconds : 1;
  return {
    type: "breastfeeding",
    occurredAt: timer.occurredAt,
    note: timer.note,
    leftSeconds,
    rightSeconds,
    clientMutationId: breastfeedingTimerMutationId(timer),
  };
}

function storePending(pending: PendingAutoSave) {
  try {
    window.localStorage.setItem(BREASTFEEDING_AUTO_SAVE_PENDING_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

function readPending(): PendingAutoSave | null {
  try {
    const raw = window.localStorage.getItem(BREASTFEEDING_AUTO_SAVE_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAutoSave>;
    if (typeof parsed.babyId !== "string" || typeof parsed.ownerId !== "string" || (parsed.status !== "draft" && parsed.status !== "queued") || typeof parsed.updatedAt !== "number" || !parsed.payload || parsed.payload.type !== "breastfeeding" || typeof parsed.payload.clientMutationId !== "string") {
      window.localStorage.removeItem(BREASTFEEDING_AUTO_SAVE_PENDING_KEY);
      return null;
    }
    return parsed as PendingAutoSave;
  } catch {
    return null;
  }
}

function removePending(clientMutationId: string) {
  try {
    const pending = readPending();
    if (pending?.payload.clientMutationId === clientMutationId) window.localStorage.removeItem(BREASTFEEDING_AUTO_SAVE_PENDING_KEY);
  } catch {
    // A failed cleanup is safe because the server request is idempotent.
  }
}

export function BreastfeedingAutoSave({ babyId }: { babyId: string }) {
  const timer = useBreastfeedingTimer();
  const { cache, mutate } = useSWRConfig();
  const recoveringRef = useRef(false);
  const ownerIdRef = useRef<string | null>(null);
  const [recoveryTick, setRecoveryTick] = useState(0);
  if (ownerIdRef.current === null) ownerIdRef.current = crypto.randomUUID();

  useEffect(() => {
    const retryPending = () => setRecoveryTick((value) => value + 1);
    window.addEventListener("online", retryPending);
    return () => window.removeEventListener("online", retryPending);
  }, []);

  useEffect(() => {
    if (recoveringRef.current) return;
    const pending = readPending();
    if (!pending) return;
    if (pending.babyId !== babyId) {
      window.localStorage.removeItem(BREASTFEEDING_AUTO_SAVE_PENDING_KEY);
      return;
    }
    const timerMatchesPending = Boolean(timer && breastfeedingTimerMutationId(timer) === pending.payload.clientMutationId);
    const wasDiscarded = "wasDiscarded" in document && Boolean((document as Document & { wasDiscarded?: boolean }).wasDiscarded);
    if (pending.status === "draft" && pending.ownerId === ownerIdRef.current && !wasDiscarded) return;
    const draftAge = Date.now() - pending.updatedAt;
    if (pending.status === "draft" && draftAge < STALE_DRAFT_AFTER_MS) {
      const retry = window.setTimeout(() => setRecoveryTick((value) => value + 1), STALE_DRAFT_AFTER_MS - draftAge + 100);
      return () => window.clearTimeout(retry);
    }
    recoveringRef.current = true;
    void fetch("/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pending.payload),
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { activity: ActivityDto };
      removePending(pending.payload.clientMutationId);
      if (timerMatchesPending) clearBreastfeedingTimer();
      await upsertActivityCaches(cache, mutate, result.activity);
    }).catch(() => {
      // Keep the pending payload for the next reconnect or app launch.
    }).finally(() => {
      recoveringRef.current = false;
    });
  }, [babyId, cache, mutate, recoveryTick, timer]);

  useEffect(() => {
    if (!timer?.activeSide) {
      if (timer) removePending(breastfeedingTimerMutationId(timer));
      return;
    }
    const activeTimer = timer;
    const ownerId = ownerIdRef.current;
    if (!ownerId || recoveringRef.current) return;
    const activeOwnerId = ownerId;
    const existing = readPending();
    const otherLiveOwner = existing?.status === "draft"
      && existing.ownerId !== activeOwnerId
      && Date.now() - existing.updatedAt < STALE_DRAFT_AFTER_MS;
    if (otherLiveOwner) return;
    let queued = false;

    const storeDraft = () => {
      const mutationId = breastfeedingTimerMutationId(activeTimer);
      const current = readPending();
      if (current?.status === "queued" && current.payload.clientMutationId === mutationId) return true;
      return storePending({ babyId: activeTimer.babyId, ownerId: activeOwnerId, status: "draft", updatedAt: Date.now(), payload: makePayload(activeTimer) });
    };
    storeDraft();
    const heartbeat = window.setInterval(storeDraft, 1_000);

    function saveBeforeExit() {
      if (queued || !activeTimer.activeSide) return;
      const pending = { babyId: activeTimer.babyId, ownerId: activeOwnerId, status: "queued", updatedAt: Date.now(), payload: makePayload(activeTimer) } satisfies PendingAutoSave;
      const persisted = storePending(pending);
      const body = JSON.stringify(pending.payload);
      const beaconQueued = typeof navigator.sendBeacon === "function"
        ? navigator.sendBeacon("/api/activities", new Blob([body], { type: "application/json" }))
        : false;
      if (!beaconQueued) {
        try {
          void fetch("/api/activities", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            credentials: "same-origin",
            keepalive: true,
          });
        } catch {
          // The persisted request will be retried on the next app launch.
        }
      }
      if (persisted || beaconQueued) {
        queued = true;
        clearBreastfeedingTimer({ preservePendingAutoSave: true });
      }
    }

    function handlePageHide(event: PageTransitionEvent) {
      if (!event.persisted) saveBeforeExit();
    }

    window.addEventListener("beforeunload", saveBeforeExit);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", saveBeforeExit);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [recoveryTick, timer]);

  return null;
}
