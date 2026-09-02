"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { ACTIVITIES_KEY, BABY_KEY, DATA_SYNC_CHANNEL, GALLERY_REFRESH_EVENT, fetchJson, revalidateResourceCaches, type DataResource } from "@/lib/swr";
import type { BabyDto } from "@/modules/baby/baby.dto";
import type { ActivityDto } from "@/modules/activity/activity.dto";

export type AccountSummary = {
  name: string | null | undefined;
  email: string | null | undefined;
};

type InitialAppData = {
  baby: BabyDto;
  activities: ActivityDto[];
  account: AccountSummary;
};

const InitialAppDataContext = createContext<InitialAppData | null>(null);

const swrOptions = {
  fetcher: fetchJson,
  revalidateOnFocus: true,
  revalidateIfStale: true,
  revalidateOnReconnect: true,
  dedupingInterval: 60_000,
  focusThrottleInterval: 60_000,
  shouldRetryOnError: false,
} as const;

export function DataCacheProvider({ children, baby, activities, account }: { children: ReactNode } & InitialAppData) {
  const initialData = useMemo(() => ({ baby, activities, account }), [account, activities, baby]);
  const config = useMemo(() => ({
    ...swrOptions,
    fallback: {
      [BABY_KEY]: { baby },
      [ACTIVITIES_KEY]: { activities },
    },
  }), [activities, baby]);

  return <InitialAppDataContext.Provider value={initialData}>
    <SWRConfig value={config}><CacheSyncListener />{children}</SWRConfig>
  </InitialAppDataContext.Provider>;
}

function CacheSyncListener() {
  const { cache, mutate } = useSWRConfig();

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(DATA_SYNC_CHANNEL);
    channel.addEventListener("message", (event: MessageEvent<{ resource?: DataResource }>) => {
      const resource = event.data?.resource;
      if (resource === "activities" || resource === "baby" || resource === "analysis") {
        if (resource === "activities") window.dispatchEvent(new Event(GALLERY_REFRESH_EVENT));
        void revalidateResourceCaches(cache, mutate, resource);
      }
    });
    return () => channel.close();
  }, [cache, mutate]);

  return null;
}

export function useInitialAppData() {
  const value = useContext(InitialAppDataContext);
  if (!value) throw new Error("useInitialAppData must be used inside DataCacheProvider");
  return value;
}
