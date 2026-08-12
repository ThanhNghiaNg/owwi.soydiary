"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChartIcon, HomeIcon, SparkIcon } from "./icons";
import { APP_TAB_EVENT } from "./top-tab-panels";
const tabs = [
  { href: "/app", label: "Hôm nay", Icon: HomeIcon },
  { href: "/app/dashboard", label: "Thống kê", Icon: ChartIcon },
  { href: "/app/ai", label: "Phân tích", Icon: SparkIcon },
] as const;
export function BottomNav() {
  const pathname = usePathname();
  const [visualPath, setVisualPath] = useState({ routePath: pathname, selectedPath: pathname });

  if (visualPath.routePath !== pathname) {
    setVisualPath({ routePath: pathname, selectedPath: pathname });
  }

  if (pathname.includes("/track/") || pathname.includes("/activity/")) return null;
  return <nav aria-label="Điều hướng chính" className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full min-w-[300px] max-w-[620px] border-t border-[var(--color-border)] bg-white/95 px-3 pt-2 backdrop-blur-xl">
    {tabs.map(({ href, label, Icon }) => {
      const active = href === "/app" ? visualPath.selectedPath === href : visualPath.selectedPath.startsWith(href);
      return <Link
        aria-current={active ? "page" : undefined}
        key={href}
        href={href}
        prefetch={false}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setVisualPath({ routePath: pathname, selectedPath: href });
          window.dispatchEvent(new CustomEvent(APP_TAB_EVENT, { detail: href }));
          if (href !== pathname) window.history.pushState(null, "", href);
        }}
        className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold transition-colors duration-200 ${active ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" : "text-[var(--color-muted)] hover:bg-zinc-50"}`}
      ><Icon className="h-6 w-6"/><span>{label}</span></Link>;
    })}
  </nav>;
}
