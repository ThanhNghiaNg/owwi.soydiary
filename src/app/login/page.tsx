import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/app");
  return <main className="flex min-h-dvh min-w-[300px] items-center justify-center bg-[#f4ebff] p-5"><section className="w-full max-w-sm rounded-[2rem] bg-white p-7 shadow-xl"><div className="mb-8 text-center"><div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-[#9b55ee] text-4xl text-white">♡</div><h1 className="text-3xl font-black">BabyTrack</h1><p className="mt-2 text-zinc-500">Theo dõi routine của bé, nhanh và gọn.</p></div><form action={async () => { "use server"; await signIn("google", { redirectTo: "/app" }); }}><button className="flex w-full items-center justify-center gap-3 rounded-2xl border border-zinc-300 bg-white px-4 py-3.5 font-bold shadow-sm active:scale-[.99]" type="submit"><span className="grid h-7 w-7 place-items-center rounded-full border font-black text-[#4285F4]">G</span>Tiếp tục với Google</button></form><p className="mt-5 text-center text-xs leading-5 text-zinc-400">Chỉ hỗ trợ đăng nhập/đăng ký bằng Google.</p></section></main>;
}
