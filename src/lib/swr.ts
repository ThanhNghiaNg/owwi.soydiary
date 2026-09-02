import type { Cache, ScopedMutator } from "swr";
import type { ActivityDto } from "@/modules/activity/activity.dto";

export const BABY_KEY = "/api/baby";
export const ACTIVITIES_KEY = "/api/activities";
export const ANALYSIS_KEY = "/api/analysis";
export const DATA_SYNC_CHANNEL = "babys-diary:data-sync";
export const GALLERY_REFRESH_EVENT = "soydiary:gallery-refresh";
export type DataResource = "activities" | "baby" | "analysis";

export type BabyResponse<T> = { baby: T | null };
export type ActivitiesResponse = { activities: ActivityDto[]; syncedAt?: string };

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchJson<T>(key: string): Promise<T> {
  const response = await fetch(key, { cache: "no-store" });
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "Không thể tải dữ liệu.";
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function isActivitiesKey(key: unknown): key is string {
  return typeof key === "string" && (key === ACTIVITIES_KEY || key.startsWith(`${ACTIVITIES_KEY}?`));
}

function matchesActivityRequest(key: string, activity: ActivityDto) {
  const url = new URL(key, "http://local");
  const type = url.searchParams.get("type");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (type && type !== activity.type) return false;
  if (from && activity.occurredAt < from) return false;
  if (to && activity.occurredAt > to) return false;
  return true;
}

function limitForKey(key: string) {
  const raw = Number(new URL(key, "http://local").searchParams.get("limit") ?? 100);
  return Number.isFinite(raw) ? Math.min(5000, Math.max(1, Math.trunc(raw))) : 100;
}

function activityKeys(cache: Cache) {
  return Array.from(cache.keys()).filter(isActivitiesKey);
}

function isResourceKey(resource: DataResource, key: unknown) {
  if (resource === "activities") return isActivitiesKey(key);
  if (resource === "baby") return key === BABY_KEY;
  return typeof key === "string" && (key === ANALYSIS_KEY || key.startsWith(`${ANALYSIS_KEY}?`));
}

export function broadcastDataChange(resource: DataResource) {
  if (typeof window === "undefined") return;
  if (resource === "activities") window.dispatchEvent(new Event(GALLERY_REFRESH_EVENT));
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel(DATA_SYNC_CHANNEL);
  channel.postMessage({ resource });
  channel.close();
}

export async function revalidateResourceCaches(cache: Cache, mutate: ScopedMutator, resource: DataResource) {
  const keys = Array.from(cache.keys()).filter((key) => isResourceKey(resource, key));
  await Promise.allSettled(keys.map((key) => mutate(key)));
}

function revalidateActivityKeys(keys: string[], mutate: ScopedMutator) {
  void Promise.allSettled(keys.map((key) => mutate(key)));
}

export async function revalidateActivityCaches(cache: Cache, mutate: ScopedMutator) {
  await revalidateResourceCaches(cache, mutate, "activities");
}

export async function upsertActivityCaches(cache: Cache, mutate: ScopedMutator, activity: ActivityDto) {
  const keys = activityKeys(cache);
  await Promise.all(keys.map((key) => mutate(
    key,
    (current: ActivitiesResponse | undefined) => {
      if (!current) return current;
      const withoutCurrent = current.activities.filter((item) => item.id !== activity.id);
      const activities = matchesActivityRequest(key, activity)
        ? [activity, ...withoutCurrent]
          .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
          .slice(0, limitForKey(key))
        : withoutCurrent;
      return { ...current, activities, syncedAt: new Date().toISOString() };
    },
    { revalidate: false },
  )));
  broadcastDataChange("activities");
  revalidateActivityKeys(keys, mutate);
}

export async function removeActivityCaches(cache: Cache, mutate: ScopedMutator, activityId: string) {
  const keys = activityKeys(cache);
  await Promise.all(keys.map((key) => mutate(
    key,
    (current: ActivitiesResponse | undefined) => current
      ? { ...current, activities: current.activities.filter((item) => item.id !== activityId), syncedAt: new Date().toISOString() }
      : current,
    { revalidate: false },
  )));
  broadcastDataChange("activities");
  revalidateActivityKeys(keys, mutate);
}
