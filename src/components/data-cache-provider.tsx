"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { ACTIVITIES_KEY, BABY_KEY, fetchJson } from "@/lib/swr";
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
  revalidateOnFocus: false,
  revalidateIfStale: false,
  revalidateOnReconnect: true,
  dedupingInterval: 60_000,
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
    <SWRConfig value={config}>{children}</SWRConfig>
  </InitialAppDataContext.Provider>;
}

export function useInitialAppData() {
  const value = useContext(InitialAppDataContext);
  if (!value) throw new Error("useInitialAppData must be used inside DataCacheProvider");
  return value;
}
