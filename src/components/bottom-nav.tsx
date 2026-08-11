"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, HomeIcon, SparkIcon } from "./icons";
const tabs = [
  { href: "/app", label: "My Child", Icon: HomeIcon },
  { href: "/app/dashboard", label: "Dashboard", Icon: ChartIcon },
  { href: "/app/ai", label: "AI", Icon: SparkIcon },
] as const;
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.includes("/track/")) return null;
  return <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full min-w-[300px] max-w-[560px] border-t border-zinc-200 bg-white/95 px-3 pt-2 backdrop-blur">
    {tabs.map(({ href, label, Icon }) => { const active = href === "/app" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={`flex flex-1 flex-col items-center gap-1 py-1 text-xs font-semibold ${active ? "text-[#9b55ee]" : "text-zinc-500"}`}><Icon className="h-6 w-6"/><span>{label}</span></Link>; })}
  </nav>;
}
