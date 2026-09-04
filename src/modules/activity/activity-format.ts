import type { ActivityDto } from "./activity.dto";

export function formatActivityDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} giờ`);
  if (minutes) parts.push(`${minutes} phút`);
  if (!hours && seconds) parts.push(`${seconds} giây`);
  return parts.join(" ") || "0 phút";
}

export function activityDetail(activity: ActivityDto) {
  switch (activity.type) {
    case "breastfeeding":
      return formatActivityDuration(activity.leftSeconds + activity.rightSeconds);
    case "bottle":
      return `${activity.amountMl} ml`;
    case "pump":
      return `${activity.leftMl + activity.rightMl} ml`;
    case "diaper":
      return { pee: "Tã ướt", poop: "Tã bẩn", mixed: "Cả hai", dry: "Tã khô" }[activity.diaperType];
    case "sleep":
      return formatActivityDuration((new Date(activity.endedAt).getTime() - new Date(activity.occurredAt).getTime()) / 1_000);
    case "tummy":
      return `${activity.durationMinutes} phút`;
    case "solid":
    case "custom":
      return activity.label;
    case "moment": {
      const details = [
        activity.note.trim() ? "Có mô tả" : "",
        activity.media.length ? `${activity.media.length} media` : "",
      ].filter(Boolean);
      return details.join(" · ") || "Khoảnh khắc";
    }
  }
}
