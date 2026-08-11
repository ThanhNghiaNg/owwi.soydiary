import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { toBabyDto } from "@/modules/baby/baby.mapper";
import { HomeScreen } from "@/modules/home/home-screen";
import { redirect } from "next/navigation";
export default async function AppPage() {
  const session = await auth(); if (!session?.user?.id) redirect("/login");
  const baby = await getBabyByOwner(session.user.id); if (!baby) redirect("/onboarding");
  return <HomeScreen serverBaby={toBabyDto(baby)}/>;
}
