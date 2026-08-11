import type { ActivityType } from "./activity.dto";

export type ActivityMeta = {
  type: ActivityType;
  label: string;
  shortLabel: string;
  asset: string;
  accent: string;
};

export const ACTIVITY_REGISTRY: readonly ActivityMeta[] = [
  { type: "breastfeeding", label: "Breastfeeding", shortLabel: "Breast", asset: "/assets/breast.png", accent: "#41c874" },
  { type: "bottle", label: "Bottle-Feeding", shortLabel: "Bottle", asset: "/assets/bottle.png", accent: "#41c874" },
  { type: "diaper", label: "Diaper Change", shortLabel: "Diaper", asset: "/assets/diaper.png", accent: "#ff914d" },
  { type: "sleep", label: "Sleep", shortLabel: "Sleep", asset: "/assets/sleep.png", accent: "#27c8c8" },
  { type: "pump", label: "Pump", shortLabel: "Pump", asset: "/assets/pump.png", accent: "#ff7f9c" },
  { type: "solid", label: "Solid Food", shortLabel: "Solid", asset: "/assets/solid.png", accent: "#41c874" },
  { type: "tummy", label: "Tummy Time", shortLabel: "Tummy", asset: "/assets/tummy.png", accent: "#ffb72e" },
  { type: "custom", label: "Custom", shortLabel: "Custom", asset: "/assets/custom.png", accent: "#b793ee" },
] as const;

export function getActivityMeta(type: ActivityType) {
  const found = ACTIVITY_REGISTRY.find((item) => item.type === type);
  if (!found) throw new Error(`Unknown activity type: ${type}`);
  return found;
}
