import { auth, signIn } from "@/auth";
import { HeartIcon } from "@/components/icons";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/app");

  return <main className="flex min-h-dvh min-w-0 items-center justify-center bg-[var(--color-canvas)] p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
    <section className="surface-card w-full max-w-sm p-7 sm:p-8">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-[1.35rem] bg-[var(--color-primary)] text-white shadow-[0_10px_24px_rgba(109,76,196,0.2)]">
          <HeartIcon className="h-8 w-8" />
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--color-primary)]">Baby&apos;s Diary</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Mọi khoảnh khắc của bé,<br />gọn trong một nơi</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-[var(--color-muted)]">Ghi lại ăn, ngủ, thay tã và nhịp sinh hoạt mỗi ngày thật nhanh.</p>
      </div>
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/app" }); }}>
        <button className="flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3.5 font-extrabold shadow-[0_3px_12px_rgba(58,43,76,0.05)] transition duration-200 hover:border-[#c9bfd5] hover:bg-[#fcfbfd] active:scale-[.985]" type="submit">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-[#dedde3] text-sm font-black text-[#4285F4]" aria-hidden="true">G</span>
          Tiếp tục với Google
        </button>
      </form>
      <p className="mt-5 text-center text-xs leading-5 text-[var(--color-muted)]">Đăng nhập an toàn bằng tài khoản Google.</p>
    </section>
  </main>;
}
