"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./bottom-nav";
import { BreastfeedingTimerBar } from "./breastfeeding-timer-bar";
import { useBreastfeedingTimer } from "@/modules/activity/breastfeeding-timer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const timer = useBreastfeedingTimer();
  const isTrackingScreen = pathname.includes("/track/");
  const isActivityDetail = pathname.includes("/activity/");
  const hasFixedAction = isTrackingScreen || isActivityDetail;
  const bottomPadding = timer ? "pb-56" : "pb-24";

  return <div className="mx-auto min-h-dvh w-full min-w-[300px] max-w-[620px] bg-[var(--color-canvas)] shadow-[0_0_40px_rgba(46,36,59,0.08)]">
    <a href="#main-content" className="skip-link">Bỏ qua đến nội dung chính</a>
    <main id="main-content" className={bottomPadding}>{children}</main>
    <BreastfeedingTimerBar aboveAction={hasFixedAction} />
    <BottomNav />
  </div>;
}
