"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BabyDto } from "@/modules/baby/baby.dto";
import type { ActivityDto } from "@/modules/activity/activity.dto";
import { cacheKeys, writeCache } from "@/lib/cache";

type HomeData = { baby: BabyDto | null; activities: ActivityDto[] };
export function useHomeData(serverBaby: BabyDto, serverActivities: ActivityDto[]) {
  const keys = useMemo(() => cacheKeys(serverBaby.id), [serverBaby.id]);
  const [data, setData] = useState<HomeData>({ baby: serverBaby, activities: serverActivities });
  const [syncing, setSyncing] = useState(true);
  const sync = useCallback(async () => {
    try {
      const [babyRes, activitiesRes] = await Promise.all([fetch("/api/baby", { cache: "no-store" }), fetch("/api/activities", { cache: "no-store" })]);
      if (!babyRes.ok || !activitiesRes.ok) return;
      const babyJson = await babyRes.json() as { baby: BabyDto | null };
      const activitiesJson = await activitiesRes.json() as { activities: ActivityDto[] };
      if (babyJson.baby) writeCache(keys.baby, babyJson.baby);
      writeCache(keys.activities, activitiesJson.activities);
      setData({ baby: babyJson.baby ?? serverBaby, activities: activitiesJson.activities });
    } finally { setSyncing(false); }
  }, [keys.activities, keys.baby, serverBaby]);
  useEffect(() => {
    writeCache(keys.baby, serverBaby);
    writeCache(keys.activities, serverActivities);
    void sync();
  }, [keys.activities, keys.baby, serverActivities, serverBaby, sync]);
  return { ...data, syncing, sync };
}
