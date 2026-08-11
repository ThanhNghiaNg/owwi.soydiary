import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { getActivityById } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";
import { ActivityEditor } from "@/modules/activity/activity-editor";

export default async function ActivityDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) redirect("/onboarding");
  const { id } = await params;
  const activity = await getActivityById(session.user.id, baby._id.toHexString(), id);
  if (!activity) notFound();
  const dto = toActivityDto(activity);
  const { from } = await searchParams;
  const returnHref = from === "history" ? "/app/history" : "/app";
  return <ActivityEditor type={dto.type} babyId={baby._id.toHexString()} activity={dto} returnHref={returnHref} />;
}
