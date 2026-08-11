import type { ActivityDto } from "@/modules/activity/activity.dto";

export type DailyPoint = { label: string; value: number };
export type DashboardData = {
  bottleMl: DailyPoint[];
  pumpMl: DailyPoint[];
  breastfeedingMinutes: DailyPoint[];
  sleepHours: DailyPoint[];
  diapers: DailyPoint[];
  tummyMinutes: DailyPoint[];
  solidCount: DailyPoint[];
  customCount: DailyPoint[];
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function aggregateDashboard(activities: ActivityDto[], days = 7, now = new Date()): DashboardData {
  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1 - index));
    return date;
  });
  const labels = dates.map((date) => new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(date));
  const buckets = dates.map(localDateKey);
  const make = () => buckets.map((_, index) => ({ label: labels[index] ?? "", value: 0 }));
  const output: DashboardData = {
    bottleMl: make(),
    pumpMl: make(),
    breastfeedingMinutes: make(),
    sleepHours: make(),
    diapers: make(),
    tummyMinutes: make(),
    solidCount: make(),
    customCount: make(),
  };

  for (const activity of activities) {
    const index = buckets.indexOf(localDateKey(new Date(activity.occurredAt)));
    if (index < 0) continue;
    if (activity.type === "bottle") output.bottleMl[index]!.value += activity.amountMl;
    if (activity.type === "pump") output.pumpMl[index]!.value += activity.leftMl + activity.rightMl;
    if (activity.type === "breastfeeding") output.breastfeedingMinutes[index]!.value += (activity.leftSeconds + activity.rightSeconds) / 60;
    if (activity.type === "sleep") output.sleepHours[index]!.value += Math.max(0, new Date(activity.endedAt).getTime() - new Date(activity.occurredAt).getTime()) / 3_600_000;
    if (activity.type === "diaper") output.diapers[index]!.value += 1;
    if (activity.type === "tummy") output.tummyMinutes[index]!.value += activity.durationMinutes;
    if (activity.type === "solid") output.solidCount[index]!.value += 1;
    if (activity.type === "custom") output.customCount[index]!.value += 1;
  }

  return output;
}
