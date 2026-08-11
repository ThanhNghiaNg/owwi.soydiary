import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { toBabyDto } from "@/modules/baby/baby.mapper";
import { HomeScreen } from "@/modules/home/home-screen";
import { listActivities } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";
import { redirect } from "next/navigation";
export default async function AppPage() {
  const session = await auth(); if (!session?.user?.id) redirect("/login");
  const baby = await getBabyByOwner(session.user.id); if (!baby?._id) redirect("/onboarding");
  const activities = await listActivities(session.user.id, baby._id.toHexString(), 100);
  return <HomeScreen
    serverBaby={toBabyDto(baby)}
    serverActivities={activities.map(toActivityDto)}
    account={{ name: session.user.name, email: session.user.email }}
  />;
}
