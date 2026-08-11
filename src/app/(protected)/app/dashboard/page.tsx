import { DashboardScreen } from "@/modules/dashboard/dashboard-screen";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { redirect } from "next/navigation";
export default async function DashboardPage(){
  const session=await auth(); if(!session?.user?.id) redirect("/login");
  const baby=await getBabyByOwner(session.user.id); if(!baby?._id) redirect("/onboarding");
  return <DashboardScreen babyId={baby._id.toHexString()}/>;
}
