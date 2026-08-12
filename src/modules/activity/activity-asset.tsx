import Image from "next/image";
import type { ActivityType } from "./activity.dto";
import { getActivityMeta } from "./activity.registry";

type ActivityAssetProps = {
  type: ActivityType;
  size?: number;
  className?: string;
};

/**
 * Shared activity artwork renderer.
 *
 * Keeping image lookup in the activity registry means adding/removing a tracker
 * does not require duplicating asset paths across screens.
 */
export function ActivityAsset({ type, size = 64, className = "" }: ActivityAssetProps) {
  const meta = getActivityMeta(type);

  return (
    <Image
      src={meta.asset}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      sizes={`${size}px`}
      unoptimized
      className={`pointer-events-none select-none object-contain ${className}`}
    />
  );
}
