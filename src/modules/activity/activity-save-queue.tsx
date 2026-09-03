"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { showToast } from "@/components/toast";
import { upsertActivityCaches } from "@/lib/swr";
import type { ActivityDto } from "./activity.dto";
import { ActivityImageUploadError, uploadPendingActivityImages } from "./activity-images";
import {
  activityMetadataPayload,
  describeActivitySaveFailure,
  durableActivityImages,
  pendingActivityImageCount,
  persistActivitySaveDraft,
  workerDraftFromPersisted,
  type ActivitySaveDraft,
  type ActivitySaveFailure,
  type ActivitySaveJobStatus,
  type ActivitySavePhase,
  type PersistedActivitySaveDraft,
} from "./activity-save-draft";
import {
  deleteActivitySaveDraft,
  listActivitySaveDrafts,
  saveActivitySaveDraft,
} from "./activity-save-store";

export type ActivityImageJobView = {
  status: ActivitySaveJobStatus;
  pendingCount: number;
  expectedCount: number;
  failure?: ActivitySaveFailure;
};

type ActivitySaveQueueValue = {
  saveActivityWithImages: (draft: ActivitySaveDraft) => Promise<ActivityDto>;
  retryActivityImages: (activityId: string) => void;
  cancelActivityImageSync: (activityId: string) => void;
  imageJobs: Readonly<Record<string, ActivityImageJobView>>;
  recoveryReady: boolean;
};

const ActivitySaveQueueContext = createContext<ActivitySaveQueueValue | null>(null);

type QueuedJob = {
  token: string;
  draft: ActivitySaveDraft;
  phase: ActivitySavePhase;
};

class ActivityRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ActivityRequestError";
  }
}

async function parseActivityResponse(response: Response, fallbackCode: string) {
  if (!response.ok) throw new ActivityRequestError(response.status === 404 ? "ACTIVITY_NOT_FOUND" : fallbackCode, response.status);
  return response.json() as Promise<{ activity: ActivityDto }>;
}

function activityMetadataRequest(draft: ActivitySaveDraft) {
  const body = activityMetadataPayload(draft);

  if (!draft.activityId) {
    body.clientMutationId = draft.clientMutationId;
    body.preserveExistingOnRetry = true;
  }
  return fetch(draft.activityId ? `/api/activities/${draft.activityId}` : "/api/activities", {
    method: draft.activityId ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function activityImageSyncRequest(
  activityId: string,
  status: "uploading" | "failed" | "synced",
  expectedCount: number,
  images?: ActivitySaveDraft["input"]["images"],
) {
  return fetch(`/api/activities/${activityId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageSync: {
        status,
        expectedCount,
        ...(images ? { images } : {}),
      },
    }),
  });
}

export function ActivitySaveQueueProvider({ babyId, children }: { babyId: string; children: ReactNode }) {
  const router = useRouter();
  const { cache, mutate } = useSWRConfig();
  const jobsRef = useRef(new Map<string, QueuedJob>());
  const runningRef = useRef(new Set<string>());
  const [imageJobs, setImageJobs] = useState<Record<string, ActivityImageJobView>>({});
  const [recoveryReady, setRecoveryReady] = useState(false);

  const publishJob = useCallback((draft: ActivitySaveDraft, status: ActivitySaveJobStatus, failure?: ActivitySaveFailure) => {
    if (!draft.activityId) return;
    setImageJobs((current) => ({
      ...current,
      [draft.activityId!]: {
        status,
        pendingCount: pendingActivityImageCount(draft.images),
        expectedCount: draft.images.length,
        ...(failure ? { failure } : {}),
      },
    }));
  }, []);

  const clearPublishedJob = useCallback((activityId: string) => {
    setImageJobs((current) => {
      if (!(activityId in current)) return current;
      const next = { ...current };
      delete next[activityId];
      return next;
    });
  }, []);

  const removeJob = useCallback(async (job: QueuedJob) => {
    jobsRef.current.delete(job.draft.id);
    if (job.draft.activityId) clearPublishedJob(job.draft.activityId);
    await deleteActivitySaveDraft(job.draft.id).catch(() => undefined);
  }, [clearPublishedJob]);

  const cacheActivity = useCallback(async (activity: ActivityDto) => {
    await upsertActivityCaches(cache, mutate, activity);
  }, [cache, mutate]);

  const run = useCallback(async (job: QueuedJob) => {
    const activityId = job.draft.activityId;
    if (!activityId || runningRef.current.has(job.draft.id)) return;
    runningRef.current.add(job.draft.id);
    let draft = job.draft;
    let phase = job.phase;
    const isCurrent = () => jobsRef.current.get(job.draft.id)?.token === job.token;

    try {
      if (phase === "sync") {
        publishJob(draft, "uploading");
        await saveActivitySaveDraft(persistActivitySaveDraft(draft, phase, "uploading")).catch(() => undefined);
      }
      if (phase === "upload") {
        publishJob(draft, "uploading");
        await saveActivitySaveDraft(persistActivitySaveDraft(draft, phase, "uploading")).catch(() => undefined);
        const statusResponse = await activityImageSyncRequest(activityId, "uploading", draft.images.length);
        if (statusResponse.status === 404) throw new ActivityRequestError("ACTIVITY_NOT_FOUND", 404);
        if (statusResponse.ok) {
          const statusResult = await statusResponse.json() as { activity: ActivityDto };
          await cacheActivity(statusResult.activity).catch(() => undefined);
        }
        if (!isCurrent()) return;

        const uploadedImages = await uploadPendingActivityImages(draft.images, draft.uploadFolderKey);
        if (!isCurrent()) return;
        draft = { ...draft, images: uploadedImages };
        phase = "sync";
        const syncingJob: QueuedJob = { ...job, draft, phase };
        jobsRef.current.set(draft.id, syncingJob);
        await saveActivitySaveDraft(persistActivitySaveDraft(draft, phase, "uploading")).catch(() => undefined);
        if (!isCurrent()) return;
      }

      const response = await activityImageSyncRequest(
        activityId,
        "synced",
        draft.images.length,
        durableActivityImages(draft.images),
      );
      const result = await parseActivityResponse(response, "ACTIVITY_IMAGE_SYNC_FAILED");
      if (!isCurrent()) return;
      await cacheActivity(result.activity).catch(() => undefined);
      await removeJob({ ...job, draft, phase });
      router.refresh();
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof ActivityRequestError && error.status === 404) {
        await removeJob({ ...job, draft, phase });
        return;
      }
      if (error instanceof ActivityImageUploadError) {
        draft = { ...draft, images: error.images };
        phase = pendingActivityImageCount(draft.images) ? "upload" : "sync";
      }
      const failure = describeActivitySaveFailure(error);
      const failedJob: QueuedJob = { ...job, draft, phase };
      jobsRef.current.set(draft.id, failedJob);
      publishJob(draft, "failed", failure);
      await saveActivitySaveDraft(persistActivitySaveDraft(draft, phase, "failed", failure)).catch(() => undefined);

      try {
        const failedResponse = await activityImageSyncRequest(
          activityId,
          "failed",
          draft.images.length,
          durableActivityImages(draft.images),
        );
        if (failedResponse.status === 404) {
          await removeJob(failedJob);
          return;
        }
        if (failedResponse.ok) {
          const failedResult = await failedResponse.json() as { activity: ActivityDto };
          await cacheActivity(failedResult.activity).catch(() => undefined);
          router.refresh();
        }
      } catch {
        // The local failed state remains authoritative until the next retry.
      }

      showToast({
        tone: "error",
        message: `${failure.message} Hoạt động đã được lưu và ảnh vẫn được giữ trên thiết bị.`,
        duration: 8000,
        action: { label: "Xem", onClick: () => router.push(`/app/activity/${activityId}`) },
      });
    } finally {
      runningRef.current.delete(job.draft.id);
    }
  }, [cacheActivity, publishJob, removeJob, router]);

  const registerAndRun = useCallback(async (draft: ActivitySaveDraft, phase: ActivitySavePhase, status: ActivitySaveJobStatus = "pending") => {
    const job: QueuedJob = { token: crypto.randomUUID(), draft, phase };
    jobsRef.current.set(draft.id, job);
    publishJob(draft, status);
    await saveActivitySaveDraft(persistActivitySaveDraft(draft, phase, status)).catch(() => undefined);
    void run(job);
  }, [publishJob, run]);

  const saveActivityWithImages = useCallback(async (draft: ActivitySaveDraft) => {
    const hasPendingImages = pendingActivityImageCount(draft.images) > 0;
    if (hasPendingImages) {
      try {
        await saveActivitySaveDraft(persistActivitySaveDraft(draft, "activity", "pending"));
      } catch {
        throw new Error("IMAGE_QUEUE_UNAVAILABLE");
      }
    }

    let response: Response;
    try {
      response = await activityMetadataRequest(draft);
      const result = await parseActivityResponse(response, "ACTIVITY_SAVE_FAILED");
      await cacheActivity(result.activity).catch(() => undefined);

      if (hasPendingImages) {
        const queuedDraft: ActivitySaveDraft = {
          ...draft,
          activityId: result.activity.id,
          uploadFolderKey: draft.activityId ?? result.activity.id,
          preserveImageSync: false,
        };
        await registerAndRun(queuedDraft, "upload");
      } else if (!draft.preserveImageSync) {
        const obsoleteJob = [...jobsRef.current.values()].find((job) => job.draft.activityId === result.activity.id);
        if (obsoleteJob) await removeJob(obsoleteJob);
      }
      return result.activity;
    } catch (error) {
      if (hasPendingImages) await deleteActivitySaveDraft(draft.id).catch(() => undefined);
      throw error;
    }
  }, [cacheActivity, registerAndRun, removeJob]);

  const retryActivityImages = useCallback((activityId: string) => {
    const job = [...jobsRef.current.values()].find((candidate) => candidate.draft.activityId === activityId);
    if (!job || runningRef.current.has(job.draft.id)) return;
    const retryJob: QueuedJob = { ...job, token: crypto.randomUUID() };
    jobsRef.current.set(job.draft.id, retryJob);
    publishJob(job.draft, "pending");
    void run(retryJob);
  }, [publishJob, run]);

  const cancelActivityImageSync = useCallback((activityId: string) => {
    const jobs = [...jobsRef.current.values()].filter((job) => job.draft.activityId === activityId);
    jobs.forEach((job) => {
      jobsRef.current.delete(job.draft.id);
      void deleteActivitySaveDraft(job.draft.id).catch(() => undefined);
    });
    clearPublishedJob(activityId);
  }, [clearPublishedJob]);

  useEffect(() => {
    let mounted = true;
    void listActivitySaveDrafts().then(async (drafts) => {
      if (!mounted) return;
      const seenActivities = new Set<string>();
      const candidates = drafts
        .filter((draft) => draft.babyId === babyId)
        .sort((left, right) => right.submittedAt - left.submittedAt);

      for (const persisted of candidates) {
        if (!mounted) return;
        let draft = workerDraftFromPersisted(persisted);
        if (draft.activityId && seenActivities.has(draft.activityId)) {
          await deleteActivitySaveDraft(draft.id).catch(() => undefined);
          continue;
        }
        if (draft.activityId) seenActivities.add(draft.activityId);

        if (persisted.phase === "activity") {
          try {
            const response = await activityMetadataRequest(draft);
            const result = await parseActivityResponse(response, "ACTIVITY_SAVE_FAILED");
            await cacheActivity(result.activity).catch(() => undefined);
            draft = {
              ...draft,
              activityId: result.activity.id,
              uploadFolderKey: draft.activityId ?? result.activity.id,
              preserveImageSync: false,
            };
            await registerAndRun(draft, "upload", "pending");
          } catch (error) {
            const failure = describeActivitySaveFailure(error);
            await saveActivitySaveDraft(persistActivitySaveDraft(draft, "activity", "failed", failure)).catch(() => undefined);
            showToast({ tone: "error", message: failure.message, duration: 8000 });
          }
          continue;
        }

        await registerAndRun(draft, persisted.phase, persisted.status);
      }
    }).catch(() => undefined).finally(() => {
      if (mounted) setRecoveryReady(true);
    });
    return () => { mounted = false; };
  }, [babyId, cacheActivity, registerAndRun]);

  const value = useMemo<ActivitySaveQueueValue>(() => ({
    saveActivityWithImages,
    retryActivityImages,
    cancelActivityImageSync,
    imageJobs,
    recoveryReady,
  }), [cancelActivityImageSync, imageJobs, recoveryReady, retryActivityImages, saveActivityWithImages]);

  return <ActivitySaveQueueContext.Provider value={value}>{children}</ActivitySaveQueueContext.Provider>;
}

export function useActivitySaveQueue() {
  const value = useContext(ActivitySaveQueueContext);
  if (!value) throw new Error("useActivitySaveQueue must be used inside ActivitySaveQueueProvider");
  return value;
}
