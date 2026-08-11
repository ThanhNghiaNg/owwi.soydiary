import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { HistoryScreen } from "@/modules/history/history-screen";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) redirect("/onboarding");
  return <HistoryScreen />;
}
