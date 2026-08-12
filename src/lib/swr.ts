import type { Cache, ScopedMutator } from "swr";
import type { ActivityDto } from "@/modules/activity/activity.dto";

export const BABY_KEY = "/api/baby";
export const ACTIVITIES_KEY = "/api/activities";

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

export function upsertActivityCaches(cache: Cache, mutate: ScopedMutator, activity: ActivityDto) {
  return Promise.all(activityKeys(cache).map((key) => mutate(
    key,
    (current: ActivitiesResponse | undefined) => {
      if (!current) return current;
      const withoutCurrent = current.activities.filter((item) => item.id !== activity.id);
      const activities = matchesActivityRequest(key, activity)
        ? [activity, ...withoutCurrent]
          .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
          .slice(0, limitForKey(key))
        : withoutCurrent;
      return { ...current, activities };
    },
    { revalidate: false },
  )));
}

export function removeActivityCaches(cache: Cache, mutate: ScopedMutator, activityId: string) {
  return Promise.all(activityKeys(cache).map((key) => mutate(
    key,
    (current: ActivitiesResponse | undefined) => current
      ? { ...current, activities: current.activities.filter((item) => item.id !== activityId) }
      : current,
    { revalidate: false },
  )));
}
