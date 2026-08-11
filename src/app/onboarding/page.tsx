import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/modules/baby/onboarding-form";
export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const existing = await getBabyByOwner(session.user.id);
  if (existing) redirect("/app");
  return <main className="min-h-dvh min-w-[300px] bg-[var(--color-canvas)] p-5 pt-[max(2rem,env(safe-area-inset-top))]"><div className="surface-card mx-auto max-w-md p-6 sm:p-8"><div className="mb-2 inline-flex rounded-full bg-[var(--color-primary-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--color-primary-strong)]">Bước cuối cùng</div><h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">Bé nhà bạn</h1><p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">Thêm hai thông tin cơ bản để cá nhân hóa nhật ký của bé.</p><OnboardingForm /></div></main>;
}
