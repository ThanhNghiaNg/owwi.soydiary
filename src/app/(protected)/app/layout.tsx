import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { AppShell } from "@/components/app-shell";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const baby = await getBabyByOwner(session.user.id);
  if (!baby) redirect("/onboarding");
  return <AppShell>{children}</AppShell>;
}
