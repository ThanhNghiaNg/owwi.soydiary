"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./bottom-nav";
import { BreastfeedingTimerBar } from "./breastfeeding-timer-bar";
import { useBreastfeedingTimer } from "@/modules/activity/breastfeeding-timer";
import { DataCacheProvider } from "./data-cache-provider";
import type { BabyDto } from "@/modules/baby/baby.dto";
import type { ActivityDto } from "@/modules/activity/activity.dto";
import type { AccountSummary } from "./data-cache-provider";
import { tabFromPath, TopTabPanels } from "./top-tab-panels";
import { BreastfeedingAutoSave } from "./breastfeeding-auto-save";
import { StorageManagerHost } from "@/modules/integrations/storage/storage-manager";
import { ToastHost } from "./toast";
import { ActivitySaveQueueProvider } from "@/modules/activity/activity-save-queue";

export function AppShell({ children, baby, activities, account }: { children: React.ReactNode; baby: BabyDto; activities: ActivityDto[]; account: AccountSummary }) {
  const pathname = usePathname();
  const timer = useBreastfeedingTimer();
  const isTrackingScreen = pathname.includes("/track/");
  const isActivityDetail = pathname.includes("/activity/");
  const hasFixedAction = isTrackingScreen || isActivityDetail;
  const bottomPadding = timer ? "pb-56" : "pb-24";
  const isTopTab = Boolean(tabFromPath(pathname));

  return <DataCacheProvider baby={baby} activities={activities} account={account}>
    <ActivitySaveQueueProvider babyId={baby.id}>
      <div className="mx-auto min-h-dvh w-full min-w-0 max-w-[620px] overflow-x-clip bg-[var(--color-canvas)] shadow-[0_0_40px_rgba(46,36,59,0.08)]">
        <BreastfeedingAutoSave babyId={baby.id} />
        <a href="#main-content" className="skip-link">Bỏ qua đến nội dung chính</a>
        <div id="main-content" className={bottomPadding}>
          <TopTabPanels pathname={pathname} visible={isTopTab} />
          {!isTopTab ? children : null}
        </div>
        <BreastfeedingTimerBar aboveAction={hasFixedAction} />
        <BottomNav />
      </div>
      <StorageManagerHost />
      <ToastHost />
    </ActivitySaveQueueProvider>
  </DataCacheProvider>;
}
