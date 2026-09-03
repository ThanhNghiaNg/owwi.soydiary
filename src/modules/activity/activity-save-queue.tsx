"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { showToast } from "@/components/toast";
import { upsertActivityCaches } from "@/lib/swr";
import type { ActivityDto } from "./activity.dto";
import { ActivityImageUploadError, uploadPendingActivityImages } from "./activity-images";
import {
  describeActivitySaveFailure,
  persistActivitySaveDraft,
  withActivitySaveImages,
  workerDraftFromPersisted,
  type ActivitySaveDraft,
  type PersistedActivitySaveDraft,
} from "./activity-save-draft";
import {
  deleteActivitySaveDraft,
  listActivitySaveDrafts,
  saveActivitySaveDraft,
} from "./activity-save-store";

type ActivitySaveQueueValue = {
  enqueueActivitySave: (draft: ActivitySaveDraft) => void;
  getFailedActivitySave: (id: string) => PersistedActivitySaveDraft | undefined;
  recoveryReady: boolean;
};

const ActivitySaveQueueContext = createContext<ActivitySaveQueueValue | null>(null);

type QueuedJob = {
  token: string;
  draft: ActivitySaveDraft;
};

function activitySaveRequest(draft: ActivitySaveDraft, images: ActivitySaveDraft["images"]) {
  const payload = withActivitySaveImages({ ...draft.input, images: [] }, images);
  const requestPayload = draft.activityId
    ? payload
    : { ...payload, clientMutationId: draft.clientMutationId };
  return fetch(draft.activityId ? `/api/activities/${draft.activityId}` : "/api/activities", {
    method: draft.activityId ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
}

export function ActivitySaveQueueProvider({ babyId, children }: { babyId: string; children: ReactNode }) {
  const router = useRouter();
  const { cache, mutate } = useSWRConfig();
  const jobsRef = useRef(new Map<string, QueuedJob>());
  const failedDraftsRef = useRef(new Map<string, PersistedActivitySaveDraft>());
  const [recoveryReady, setRecoveryReady] = useState(false);

  const persist = useCallback(async (draft: ActivitySaveDraft, status: "queued" | "failed", failure?: PersistedActivitySaveDraft["failure"]) => {
    await saveActivitySaveDraft(persistActivitySaveDraft(draft, status, failure));
  }, []);

  const run = useCallback(async (job: QueuedJob) => {
    let draft = job.draft;
    try {
      const uploadedImages = await uploadPendingActivityImages(draft.images, draft.uploadFolderKey);
      draft = {
        ...draft,
        images: uploadedImages,
        input: withActivitySaveImages(draft.input, uploadedImages),
      };
      await persist(draft, "queued").catch(() => undefined);

      const response = await activitySaveRequest(draft, uploadedImages);
      if (!response.ok) throw new Error("ACTIVITY_SAVE_FAILED");
      const result = await response.json() as { activity: ActivityDto };

      if (jobsRef.current.get(job.draft.id)?.token !== job.token) return;
      jobsRef.current.delete(job.draft.id);
      failedDraftsRef.current.delete(job.draft.id);
      await deleteActivitySaveDraft(job.draft.id).catch(() => undefined);
      try {
        await upsertActivityCaches(cache, mutate, result.activity);
      } finally {
        router.refresh();
      }
    } catch (error) {
      if (jobsRef.current.get(job.draft.id)?.token !== job.token) return;
      if (error instanceof ActivityImageUploadError) {
        draft = {
          ...draft,
          images: error.images,
          input: withActivitySaveImages(draft.input, error.images),
        };
      }
      const failure = describeActivitySaveFailure(error);
      const persisted = persistActivitySaveDraft(draft, "failed", failure);
      jobsRef.current.delete(job.draft.id);
      failedDraftsRef.current.set(job.draft.id, persisted);
      await saveActivitySaveDraft(persisted).catch(() => undefined);
      showToast({
        tone: "error",
        message: `${failure.message} Đã mở lại hoạt động để bạn kiểm tra và lưu lại.`,
        duration: 8000,
      });
      router.push(draft.retryHref);
    }
  }, [cache, mutate, persist, router]);

  const enqueueActivitySave = useCallback((draft: ActivitySaveDraft) => {
    const job: QueuedJob = { token: crypto.randomUUID(), draft };
    jobsRef.current.set(draft.id, job);
    failedDraftsRef.current.delete(draft.id);
    void persist(draft, "queued").catch(() => undefined).then(() => run(job));
  }, [persist, run]);

  const getFailedActivitySave = useCallback((id: string) => failedDraftsRef.current.get(id), []);

  useEffect(() => {
    let mounted = true;
    void listActivitySaveDrafts().then((drafts) => {
      if (!mounted) return;
      drafts.filter((draft) => draft.babyId === babyId).forEach((draft) => {
        if (draft.status === "failed") {
          failedDraftsRef.current.set(draft.id, draft);
          showToast({
            tone: "error",
            message: `${draft.failure?.message ?? "Một hoạt động chưa được lưu."} Bản nháp và hình ảnh vẫn được giữ.`,
            duration: 8000,
            action: { label: "Mở lại", onClick: () => router.push(draft.retryHref) },
          });
          return;
        }
        const job: QueuedJob = { token: crypto.randomUUID(), draft: workerDraftFromPersisted(draft) };
        jobsRef.current.set(draft.id, job);
        void run(job);
      });
    }).catch(() => undefined).finally(() => {
      if (mounted) setRecoveryReady(true);
    });
    return () => { mounted = false; };
  }, [babyId, router, run]);

  const value = useMemo<ActivitySaveQueueValue>(() => ({
    enqueueActivitySave,
    getFailedActivitySave,
    recoveryReady,
  }), [enqueueActivitySave, getFailedActivitySave, recoveryReady]);

  return <ActivitySaveQueueContext.Provider value={value}>{children}</ActivitySaveQueueContext.Provider>;
}

export function useActivitySaveQueue() {
  const value = useContext(ActivitySaveQueueContext);
  if (!value) throw new Error("useActivitySaveQueue must be used inside ActivitySaveQueueProvider");
  return value;
}
