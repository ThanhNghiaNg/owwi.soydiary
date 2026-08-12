import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { AppShell } from "@/components/app-shell";
import { toBabyDto } from "@/modules/baby/baby.mapper";
import { listActivities } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) redirect("/onboarding");
  const activities = await listActivities(session.user.id, baby._id.toHexString(), 100);
  return <AppShell
    baby={toBabyDto(baby)}
    activities={activities.map(toActivityDto)}
    account={{ name: session.user.name, email: session.user.email }}
  >{children}</AppShell>;
}
