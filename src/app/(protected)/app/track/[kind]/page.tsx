import { notFound, redirect } from "next/navigation";
import type { ActivityType } from "@/modules/activity/activity.dto";
import { ActivityEditor } from "@/modules/activity/activity-editor";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
const kinds = new Set<ActivityType>(["breastfeeding","bottle","pump","diaper","sleep","tummy","solid","moment","custom"]);
export default async function TrackPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ from?: string; retry?: string }> }) {
  const { kind } = await params;
  const { from, retry } = await searchParams;
  if (!kinds.has(kind as ActivityType)) notFound();
  const session = await auth(); if (!session?.user?.id) redirect("/login");
  const baby = await getBabyByOwner(session.user.id); if (!baby?._id) redirect("/onboarding");
  return <ActivityEditor type={kind as ActivityType} babyId={baby._id.toHexString()} returnHref={from === "history" ? "/app/history" : "/app"} {...(retry ? { retryId: retry } : {})}/>;
}
