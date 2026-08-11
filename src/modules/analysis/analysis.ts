import type { ActivityDto } from "@/modules/activity/activity.dto";

type DailyAnalysis = {
  date: string;
  breastfeedingSessions: number;
  breastfeedingMinutes: number;
  bottleSessions: number;
  bottleMl: number;
  pumpSessions: number;
  pumpMl: number;
  sleepSessions: number;
  sleepHours: number;
  diaperChanges: number;
  tummyMinutes: number;
  solidMeals: number;
  otherActivities: number;
};

function zonedDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function recentDateKeys(days: number, now: Date, timeZone: string) {
  const current = zonedDateKey(now, timeZone);
  const [year, month, day] = current.split("-").map(Number);
  const anchor = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);
  return Array.from({ length: days }, (_, index) => new Date(anchor - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10));
}

function rounded(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function averageIntervalHours(activities: ActivityDto[]) {
  const feedingTimes = activities
    .filter((activity) => activity.type === "breastfeeding" || activity.type === "bottle")
    .map((activity) => new Date(activity.occurredAt).getTime())
    .sort((a, b) => a - b);
  const intervals = feedingTimes.slice(1).map((time, index) => (time - feedingTimes[index]!) / 3_600_000).filter((hours) => hours > 0 && hours <= 12);
  const value = average(intervals);
  return value === null ? null : rounded(value);
}

export function buildAnalysisDigest(activities: ActivityDto[], timeZone: string, now = new Date(), days = 14) {
  const dateKeys = recentDateKeys(days, now, timeZone);
  const daily = new Map<string, DailyAnalysis>(dateKeys.map((date) => [date, {
    date,
    breastfeedingSessions: 0,
    breastfeedingMinutes: 0,
    bottleSessions: 0,
    bottleMl: 0,
    pumpSessions: 0,
    pumpMl: 0,
    sleepSessions: 0,
    sleepHours: 0,
    diaperChanges: 0,
    tummyMinutes: 0,
    solidMeals: 0,
    otherActivities: 0,
  }]));

  const included = activities.filter((activity) => daily.has(zonedDateKey(new Date(activity.occurredAt), timeZone)));
  for (const activity of included) {
    const bucket = daily.get(zonedDateKey(new Date(activity.occurredAt), timeZone));
    if (!bucket) continue;
    if (activity.type === "breastfeeding") {
      bucket.breastfeedingSessions += 1;
      bucket.breastfeedingMinutes += (activity.leftSeconds + activity.rightSeconds) / 60;
    }
    if (activity.type === "bottle") {
      bucket.bottleSessions += 1;
      bucket.bottleMl += activity.amountMl;
    }
    if (activity.type === "pump") {
      bucket.pumpSessions += 1;
      bucket.pumpMl += activity.leftMl + activity.rightMl;
    }
    if (activity.type === "sleep") {
      bucket.sleepSessions += 1;
      bucket.sleepHours += Math.max(0, new Date(activity.endedAt).getTime() - new Date(activity.occurredAt).getTime()) / 3_600_000;
    }
    if (activity.type === "diaper") bucket.diaperChanges += 1;
    if (activity.type === "tummy") bucket.tummyMinutes += activity.durationMinutes;
    if (activity.type === "solid") bucket.solidMeals += 1;
    if (activity.type === "custom") bucket.otherActivities += 1;
  }

  const breastDurations = included.filter((activity) => activity.type === "breastfeeding").map((activity) => (activity.leftSeconds + activity.rightSeconds) / 60);
  const bottleAmounts = included.filter((activity) => activity.type === "bottle").map((activity) => activity.amountMl);
  const sleepDurations = included.filter((activity) => activity.type === "sleep").map((activity) => Math.max(0, new Date(activity.endedAt).getTime() - new Date(activity.occurredAt).getTime()) / 3_600_000);
  const rows = [...daily.values()].map((row) => ({
    ...row,
    breastfeedingMinutes: rounded(row.breastfeedingMinutes),
    sleepHours: rounded(row.sleepHours),
  }));

  return {
    timeZone,
    windowDays: days,
    activityCount: included.length,
    activeDays: rows.filter((row) => Object.entries(row).some(([key, value]) => key !== "date" && typeof value === "number" && value > 0)).length,
    averages: {
      feedingIntervalHours: averageIntervalHours(included),
      breastfeedingSessionMinutes: breastDurations.length ? rounded(average(breastDurations) ?? 0) : null,
      bottleMlPerSession: bottleAmounts.length ? Math.round(average(bottleAmounts) ?? 0) : null,
      sleepHoursPerSession: sleepDurations.length ? rounded(average(sleepDurations) ?? 0) : null,
    },
    daily: rows,
  };
}
