import type { ActivityType } from "./activity.dto";

export type ActivityMeta = {
  type: ActivityType;
  label: string;
  shortLabel: string;
  asset: string;
  accent: string;
};

export const ACTIVITY_REGISTRY: readonly ActivityMeta[] = [
  { type: "breastfeeding", label: "Bú mẹ", shortLabel: "Bú mẹ", asset: "/assets/breast.png", accent: "#3E9B69" },
  { type: "bottle", label: "Bú bình", shortLabel: "Bú bình", asset: "/assets/bottle.png", accent: "#338D78" },
  { type: "diaper", label: "Thay tã", shortLabel: "Thay tã", asset: "/assets/diaper.png", accent: "#D9773F" },
  { type: "sleep", label: "Giấc ngủ", shortLabel: "Ngủ", asset: "/assets/sleep.png", accent: "#3C83A4" },
  { type: "pump", label: "Hút sữa", shortLabel: "Hút sữa", asset: "/assets/pump.png", accent: "#C76582" },
  { type: "solid", label: "Ăn dặm", shortLabel: "Ăn dặm", asset: "/assets/solid.png", accent: "#568B50" },
  { type: "tummy", label: "Nằm sấp", shortLabel: "Nằm sấp", asset: "/assets/tummy.png", accent: "#B98020" },
  { type: "custom", label: "Hoạt động khác", shortLabel: "Khác", asset: "/assets/custom.png", accent: "#8262BD" },
] as const;

export function getActivityMeta(type: ActivityType) {
  const found = ACTIVITY_REGISTRY.find((item) => item.type === type);
  if (!found) throw new Error(`Unknown activity type: ${type}`);
  return found;
}
