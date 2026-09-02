import type { ActivityDto } from "@/modules/activity/activity.dto";

export type DashboardPreset = "today" | "yesterday" | "7-days" | "14-days" | "30-days" | "90-days";
export type ChartVariant = "bar" | "line" | "area";
export type ChartGranularity = "hourly" | "daily" | "weekly";
export type DashboardMetricKey = "breastfeedingMinutes" | "diapers" | "pumpMl" | "bottleMl" | "sleepHours" | "tummyMinutes" | "solidCount" | "momentCount" | "customCount";

export type TimePoint = {
  label: string;
  fullLabel: string;
  value: number;
};

export type MetricSeries = {
  points: TimePoint[];
  detailPoints: TimePoint[];
  total: number;
  averagePerDay: number;
};

export type DashboardData = Record<DashboardMetricKey, MetricSeries>;

export type DashboardRange = {
  preset: DashboardPreset;
  start: Date;
  end: Date;
  dayCount: number;
  label: string;
  compactLabel: string;
  chartVariant: ChartVariant;
  granularity: ChartGranularity;
  chartLabel: string;
};

export const DASHBOARD_PRESETS: ReadonlyArray<{ value: DashboardPreset; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "7-days", label: "7 ngày" },
  { value: "14-days", label: "14 ngày" },
  { value: "30-days", label: "30 ngày" },
  { value: "90-days", label: "90 ngày" },
];

type Bucket = {
  start: number;
  end: number;
  label: string;
  fullLabel: string;
  dayCount: number;
};

const metricKeys: DashboardMetricKey[] = [
  "breastfeedingMinutes",
  "diapers",
  "pumpMl",
  "bottleMl",
  "sleepHours",
  "tummyMinutes",
  "solidCount",
  "momentCount",
  "customCount",
];

function startOfDay(date: Date) {
  const output = new Date(date);
  output.setHours(0, 0, 0, 0);
  return output;
}

function endOfDay(date: Date) {
  const output = new Date(date);
  output.setHours(23, 59, 59, 999);
  return output;
}

function addDays(date: Date, days: number) {
  const output = new Date(date);
  output.setDate(output.getDate() + days);
  return output;
}

function shortDate(date: Date) {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function fullDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric" }).format(date);
}

function weekdayLabel(date: Date) {
  return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getDay()] ?? "";
}

export function makeDashboardRange(preset: DashboardPreset, now = new Date()): DashboardRange {
  const today = startOfDay(now);
  if (preset === "today") return {
    preset,
    start: today,
    end: endOfDay(today),
    dayCount: 1,
    label: "Hôm nay",
    compactLabel: "Hôm nay",
    chartVariant: "bar",
    granularity: "hourly",
    chartLabel: "Theo khung 4 giờ",
  };
  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return {
      preset,
      start: yesterday,
      end: endOfDay(yesterday),
      dayCount: 1,
      label: "Hôm qua",
      compactLabel: "Hôm qua",
      chartVariant: "bar",
      granularity: "hourly",
      chartLabel: "Theo khung 4 giờ",
    };
  }

  const dayCount = Number.parseInt(preset, 10);
  const isWeekly = dayCount >= 30;
  return {
    preset,
    start: addDays(today, -(dayCount - 1)),
    end: endOfDay(today),
    dayCount,
    label: `${dayCount} ngày gần nhất`,
    compactLabel: `${dayCount} ngày`,
    chartVariant: isWeekly ? "area" : "line",
    granularity: isWeekly ? "weekly" : "daily",
    chartLabel: isWeekly ? "Trung bình mỗi ngày theo tuần" : "Theo từng ngày",
  };
}

export function dashboardRangeToIso(range: DashboardRange) {
  return { from: range.start.toISOString(), to: range.end.toISOString() };
}

export function filterActivitiesForRange(activities: ActivityDto[], range: DashboardRange) {
  const start = range.start.getTime();
  const end = range.end.getTime();
  return activities.filter((activity) => {
    const occurredAt = new Date(activity.occurredAt).getTime();
    return occurredAt >= start && occurredAt <= end;
  });
}

function buildBuckets(range: DashboardRange): Bucket[] {
  if (range.granularity === "hourly") return Array.from({ length: 6 }, (_, index) => {
    const startDate = new Date(range.start);
    startDate.setHours(index * 4, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 4, 0, 0, -1);
    return {
      start: startDate.getTime(),
      end: endDate.getTime(),
      label: `${String(index * 4).padStart(2, "0")}h`,
      fullLabel: `${String(index * 4).padStart(2, "0")}:00–${String(index * 4 + 3).padStart(2, "0")}:59`,
      dayCount: 1,
    };
  });

  if (range.granularity === "daily") return Array.from({ length: range.dayCount }, (_, index) => {
    const date = addDays(range.start, index);
    return {
      start: startOfDay(date).getTime(),
      end: endOfDay(date).getTime(),
      label: range.dayCount <= 7 ? weekdayLabel(date) : shortDate(date),
      fullLabel: fullDate(date),
      dayCount: 1,
    };
  });

  const buckets: Bucket[] = [];
  for (let index = 0; index < range.dayCount; index += 7) {
    const startDate = addDays(range.start, index);
    const daysInBucket = Math.min(7, range.dayCount - index);
    const endDate = addDays(startDate, daysInBucket - 1);
    buckets.push({
      start: startOfDay(startDate).getTime(),
      end: endOfDay(endDate).getTime(),
      label: shortDate(startDate),
      fullLabel: `${shortDate(startDate)}–${shortDate(endDate)}`,
      dayCount: daysInBucket,
    });
  }
  return buckets;
}

function buildDetailBuckets(range: DashboardRange, chartBuckets: Bucket[]) {
  if (range.granularity !== "hourly") return chartBuckets;
  return Array.from({ length: 24 }, (_, hour) => {
    const startDate = new Date(range.start);
    startDate.setHours(hour, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(hour + 1, 0, 0, -1);
    const hourLabel = String(hour).padStart(2, "0");
    return {
      start: startDate.getTime(),
      end: endDate.getTime(),
      label: `${hourLabel}h`,
      fullLabel: `${hourLabel}:00–${hourLabel}:59`,
      dayCount: 1,
    };
  });
}

function contribution(activity: ActivityDto): [DashboardMetricKey, number] {
  if (activity.type === "breastfeeding") return ["breastfeedingMinutes", (activity.leftSeconds + activity.rightSeconds) / 60];
  if (activity.type === "diaper") return ["diapers", 1];
  if (activity.type === "pump") return ["pumpMl", activity.leftMl + activity.rightMl];
  if (activity.type === "bottle") return ["bottleMl", activity.amountMl];
  if (activity.type === "sleep") return ["sleepHours", Math.max(0, new Date(activity.endedAt).getTime() - new Date(activity.occurredAt).getTime()) / 3_600_000];
  if (activity.type === "tummy") return ["tummyMinutes", activity.durationMinutes];
  if (activity.type === "solid") return ["solidCount", 1];
  if (activity.type === "moment") return ["momentCount", 1];
  return ["customCount", 1];
}

export function aggregateDashboard(activities: ActivityDto[], range: DashboardRange): DashboardData {
  const buckets = buildBuckets(range);
  const detailBuckets = buildDetailBuckets(range, buckets);
  const values = Object.fromEntries(metricKeys.map((key) => [key, buckets.map(() => 0)])) as Record<DashboardMetricKey, number[]>;
  const detailValues = Object.fromEntries(metricKeys.map((key) => [key, detailBuckets.map(() => 0)])) as Record<DashboardMetricKey, number[]>;

  for (const activity of activities) {
    const occurredAt = new Date(activity.occurredAt).getTime();
    const bucketIndex = buckets.findIndex((bucket) => occurredAt >= bucket.start && occurredAt <= bucket.end);
    if (bucketIndex < 0) continue;
    const [key, value] = contribution(activity);
    values[key][bucketIndex] = (values[key][bucketIndex] ?? 0) + value;
    const detailBucketIndex = detailBuckets.findIndex((bucket) => occurredAt >= bucket.start && occurredAt <= bucket.end);
    if (detailBucketIndex >= 0) detailValues[key][detailBucketIndex] = (detailValues[key][detailBucketIndex] ?? 0) + value;
  }

  return Object.fromEntries(metricKeys.map((key) => {
    const total = values[key].reduce((sum, value) => sum + value, 0);
    const points = buckets.map((bucket, index) => ({
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      value: range.granularity === "weekly" ? (values[key][index] ?? 0) / bucket.dayCount : values[key][index] ?? 0,
    }));
    const detailPoints = detailBuckets.map((bucket, index) => ({
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      value: range.granularity === "weekly" ? (detailValues[key][index] ?? 0) / bucket.dayCount : detailValues[key][index] ?? 0,
    }));
    return [key, { points, detailPoints, total, averagePerDay: total / range.dayCount }];
  })) as DashboardData;
}
