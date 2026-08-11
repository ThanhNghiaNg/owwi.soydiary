import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/modules/baby/onboarding-form";
export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const existing = await getBabyByOwner(session.user.id);
  if (existing) redirect("/app");
  return <main className="min-h-dvh min-w-[300px] bg-[#f4ebff] p-5 pt-[max(2rem,env(safe-area-inset-top))]"><div className="mx-auto max-w-md rounded-[2rem] bg-white p-6 shadow-xl"><h1 className="text-3xl font-black">Bé nhà bạn</h1><p className="mt-2 text-zinc-500">Chỉ cần 2 thông tin để bắt đầu.</p><OnboardingForm /></div></main>;
}
