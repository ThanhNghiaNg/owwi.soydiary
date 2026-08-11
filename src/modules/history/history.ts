import type { ActivityDto } from "@/modules/activity/activity.dto";
import { formatActivityDuration } from "@/modules/activity/activity-format";
import { getActivityMeta } from "@/modules/activity/activity.registry";

export type RangePreset = "today" | "yesterday" | "7-days" | "30-days" | "custom";
export type HistoryRange = { preset: RangePreset; start: string; end: string };
export type SummaryRow = { label: string; value: string; divider?: boolean };
export type SummarySection = { key: string; title: string; accent: string; rows: SummaryRow[] };

const dayFormatter = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDayFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromLocalDate(value: string, endOfDay = false) {
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
}

export function makeHistoryRange(preset: Exclude<RangePreset, "custom">, now = new Date()): HistoryRange {
  const start = new Date(now);
  const end = new Date(now);
  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === "7-days") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "30-days") {
    start.setDate(start.getDate() - 29);
  }
  return { preset, start: localDateKey(start), end: localDateKey(end) };
}

export function rangeToIso(range: HistoryRange) {
  return { from: fromLocalDate(range.start).toISOString(), to: fromLocalDate(range.end, true).toISOString() };
}

export function rangeDayCount(range: HistoryRange) {
  return Math.max(1, Math.round((fromLocalDate(range.end).getTime() - fromLocalDate(range.start).getTime()) / 86_400_000) + 1);
}

export function formatRangeLabel(range: HistoryRange) {
  const start = fromLocalDate(range.start);
  const end = fromLocalDate(range.end);
  if (range.start === range.end) {
    const today = localDateKey(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const prefix = range.start === today ? "Hôm nay" : range.start === localDateKey(yesterday) ? "Hôm qua" : "";
    return prefix ? `${prefix}, ${dayFormatter.format(start)}` : dayFormatter.format(start);
  }
  return `${shortDayFormatter.format(start)} – ${shortDayFormatter.format(end)}`;
}

export function groupActivitiesByDay(activities: ActivityDto[]) {
  const groups = new Map<string, ActivityDto[]>();
  for (const activity of activities) {
    const key = localDateKey(new Date(activity.occurredAt));
    groups.set(key, [...(groups.get(key) ?? []), activity]);
  }
  return Array.from(groups.entries()).map(([key, items]) => ({ key, label: formatDayLabel(key), activities: items }));
}

export function formatDayLabel(key: string) {
  const date = fromLocalDate(key);
  const today = localDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === today) return `Hôm nay, ${dayFormatter.format(date)}`;
  if (key === localDateKey(yesterday)) return `Hôm qua, ${dayFormatter.format(date)}`;
  return dayFormatter.format(date);
}

function average(value: number, count: number, digits = 1) {
  if (!count) return 0;
  const factor = 10 ** digits;
  return Math.round(value / count * factor) / factor;
}

function countText(value: number, days: number) {
  return days === 1 ? String(value) : `${average(value, days)} / ngày`;
}

function amountText(value: number) {
  return `${Math.round(value)} ml`;
}

function durationFromActivities(activities: Extract<ActivityDto, { type: "sleep" }>[]) {
  return activities.reduce((total, item) => total + Math.max(0, new Date(item.endedAt).getTime() - new Date(item.occurredAt).getTime()) / 1_000, 0);
}

function lastTime(activities: ActivityDto[]) {
  const item = activities[0];
  return item ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.occurredAt)) : "—";
}

export function buildHistorySummary(activities: ActivityDto[], range: HistoryRange): SummarySection[] {
  const days = rangeDayCount(range);
  const breast = activities.filter((item): item is Extract<ActivityDto, { type: "breastfeeding" }> => item.type === "breastfeeding");
  const diapers = activities.filter((item): item is Extract<ActivityDto, { type: "diaper" }> => item.type === "diaper");
  const pumps = activities.filter((item): item is Extract<ActivityDto, { type: "pump" }> => item.type === "pump");
  const bottles = activities.filter((item): item is Extract<ActivityDto, { type: "bottle" }> => item.type === "bottle");
  const sleeps = activities.filter((item): item is Extract<ActivityDto, { type: "sleep" }> => item.type === "sleep");
  const tummy = activities.filter((item): item is Extract<ActivityDto, { type: "tummy" }> => item.type === "tummy");
  const solid = activities.filter((item): item is Extract<ActivityDto, { type: "solid" }> => item.type === "solid");
  const custom = activities.filter((item): item is Extract<ActivityDto, { type: "custom" }> => item.type === "custom");
  const breastSeconds = breast.reduce((sum, item) => sum + item.leftSeconds + item.rightSeconds, 0);
  const pumpMl = pumps.reduce((sum, item) => sum + item.leftMl + item.rightMl, 0);
  const bottleMl = bottles.reduce((sum, item) => sum + item.amountMl, 0);
  const sleepSeconds = durationFromActivities(sleeps);
  const tummyMinutes = tummy.reduce((sum, item) => sum + item.durationMinutes, 0);
  const feeding = [...breast, ...bottles].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const chronologicalFeeds = [...feeding].reverse();
  const gapSeconds = chronologicalFeeds.slice(1).reduce((sum, item, index) => sum + (new Date(item.occurredAt).getTime() - new Date(chronologicalFeeds[index]!.occurredAt).getTime()) / 1_000, 0);
  const averageGap = chronologicalFeeds.length > 1 ? formatActivityDuration(gapSeconds / (chronologicalFeeds.length - 1)) : "—";

  const sections: SummarySection[] = [];
  if (breast.length) sections.push({
    key: "breastfeeding", title: "Bú mẹ", accent: getActivityMeta("breastfeeding").accent, rows: [
      { label: "Cữ gần nhất", value: lastTime(breast) },
      { label: "Tổng số cữ", value: countText(breast.length, days) },
      { label: "Tổng thời gian", value: formatActivityDuration(breastSeconds), divider: true },
      { label: "Trung bình mỗi cữ", value: formatActivityDuration(average(breastSeconds, breast.length, 0)) },
      { label: "Khoảng cách trung bình", value: averageGap },
    ],
  });
  if (diapers.length) sections.push({
    key: "diaper", title: "Thay tã", accent: getActivityMeta("diaper").accent, rows: [
      { label: "Lần gần nhất", value: lastTime(diapers) },
      { label: "Tổng số lần", value: countText(diapers.length, days) },
      { label: "Tã ướt", value: String(diapers.filter((item) => item.diaperType === "pee").length), divider: true },
      { label: "Tã bẩn", value: String(diapers.filter((item) => item.diaperType === "poop").length) },
      { label: "Cả hai", value: String(diapers.filter((item) => item.diaperType === "mixed").length) },
      { label: "Tã khô", value: String(diapers.filter((item) => item.diaperType === "dry").length) },
    ],
  });
  if (pumps.length) sections.push({
    key: "pump", title: "Hút sữa", accent: getActivityMeta("pump").accent, rows: [
      { label: "Lần gần nhất", value: lastTime(pumps) },
      { label: "Tổng số lần", value: countText(pumps.length, days) },
      { label: "Tổng lượng sữa", value: amountText(pumpMl), divider: true },
      { label: "Trung bình mỗi lần", value: amountText(average(pumpMl, pumps.length, 0)) },
    ],
  });
  if (bottles.length) sections.push({
    key: "bottle", title: "Bú bình", accent: getActivityMeta("bottle").accent, rows: [
      { label: "Cữ gần nhất", value: lastTime(bottles) },
      { label: "Tổng số cữ", value: countText(bottles.length, days) },
      { label: "Tổng lượng sữa", value: amountText(bottleMl), divider: true },
      { label: "Trung bình mỗi cữ", value: amountText(average(bottleMl, bottles.length, 0)) },
    ],
  });
  if (sleeps.length) sections.push({
    key: "sleep", title: "Giấc ngủ", accent: getActivityMeta("sleep").accent, rows: [
      { label: "Giấc gần nhất", value: lastTime(sleeps) },
      { label: "Tổng số giấc", value: countText(sleeps.length, days) },
      { label: "Tổng thời gian ngủ", value: formatActivityDuration(sleepSeconds), divider: true },
      { label: "Trung bình mỗi giấc", value: formatActivityDuration(average(sleepSeconds, sleeps.length, 0)) },
    ],
  });
  if (tummy.length) sections.push({ key: "tummy", title: "Nằm sấp", accent: getActivityMeta("tummy").accent, rows: [
    { label: "Tổng số lần", value: countText(tummy.length, days) },
    { label: "Tổng thời gian", value: `${tummyMinutes} phút`, divider: true },
    { label: "Trung bình mỗi lần", value: `${average(tummyMinutes, tummy.length)} phút` },
  ] });
  if (solid.length) sections.push({ key: "solid", title: "Ăn dặm", accent: getActivityMeta("solid").accent, rows: [
    { label: "Bữa gần nhất", value: lastTime(solid) }, { label: "Tổng số bữa", value: countText(solid.length, days) },
  ] });
  if (custom.length) sections.push({ key: "custom", title: "Hoạt động khác", accent: getActivityMeta("custom").accent, rows: [
    { label: "Lần gần nhất", value: lastTime(custom) }, { label: "Tổng số lần", value: countText(custom.length, days) },
  ] });
  return sections;
}
