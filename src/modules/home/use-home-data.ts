"use client";
import useSWR from "swr";
import type { BabyDto } from "@/modules/baby/baby.dto";
import { ACTIVITIES_KEY, BABY_KEY, type ActivitiesResponse, type BabyResponse } from "@/lib/swr";
import { useInitialAppData } from "@/components/data-cache-provider";

export function useHomeData() {
  const { baby: initialBaby, activities: initialActivities } = useInitialAppData();
  const babyState = useSWR<BabyResponse<BabyDto>>(BABY_KEY, { revalidateOnMount: false });
  const activitiesState = useSWR<ActivitiesResponse>(ACTIVITIES_KEY, { revalidateOnMount: false });

  return {
    baby: babyState.data?.baby ?? initialBaby,
    activities: activitiesState.data?.activities ?? initialActivities,
    syncing: babyState.isValidating || activitiesState.isValidating,
  };
}
