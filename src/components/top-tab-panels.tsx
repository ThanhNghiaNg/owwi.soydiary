"use client";

import { useEffect, useRef, useState } from "react";
import { HomeScreen } from "@/modules/home/home-screen";
import { DashboardScreen } from "@/modules/dashboard/dashboard-screen";
import { AnalysisScreen } from "@/modules/analysis/analysis-screen";
import { GalleryScreen } from "@/modules/gallery/gallery-screen";
import { TopHeader } from "./top-header";

export const APP_TAB_EVENT = "babys-diary:select-tab";

type TabKey = "home" | "dashboard" | "analysis" | "gallery";

export function tabFromPath(pathname: string): TabKey | null {
  if (pathname === "/app") return "home";
  if (pathname.startsWith("/app/dashboard")) return "dashboard";
  if (pathname.startsWith("/app/ai")) return "analysis";
  if (pathname.startsWith("/app/gallery")) return "gallery";
  return null;
}

export function TopTabPanels({ pathname, visible }: { pathname: string; visible: boolean }) {
  const initialTab = tabFromPath(pathname) ?? "home";
  const [view, setView] = useState<{ routePath: string; active: TabKey; visited: Set<TabKey> }>(() => ({
    routePath: pathname,
    active: initialTab,
    visited: new Set([initialTab]),
  }));
  const scrollPositionsRef = useRef<Partial<Record<TabKey, number>>>({});

  if (view.routePath !== pathname) {
    const routeTab = tabFromPath(pathname);
    setView({
      routePath: pathname,
      active: routeTab ?? view.active,
      visited: routeTab ? new Set(view.visited).add(routeTab) : view.visited,
    });
  }

  useEffect(() => {
    function selectTab(event: Event) {
      const nextTab = tabFromPath((event as CustomEvent<string>).detail);
      if (!nextTab) return;
      scrollPositionsRef.current[view.active] = window.scrollY;
      setView((current) => ({ ...current, active: nextTab, visited: new Set(current.visited).add(nextTab) }));
      window.requestAnimationFrame(() => window.scrollTo(0, scrollPositionsRef.current[nextTab] ?? 0));
    }
    window.addEventListener(APP_TAB_EVENT, selectTab);
    return () => window.removeEventListener(APP_TAB_EVENT, selectTab);
  }, [view.active]);

  return <div hidden={!visible}>
    <div hidden={view.active !== "home"}>{view.visited.has("home") ? <HomeScreen /> : null}</div>
    <div hidden={view.active !== "dashboard"}>{view.visited.has("dashboard") ? <DashboardScreen /> : null}</div>
    <div hidden={view.active !== "analysis"}>{view.visited.has("analysis") ? <div className="app-page"><TopHeader title="Phân tích" subtitle="Hiểu rõ hơn từ nhật ký của bé" /><AnalysisScreen /></div> : null}</div>
    <div hidden={view.active !== "gallery"}>{view.visited.has("gallery") ? <div className="app-page"><TopHeader title="Bộ sưu tập" subtitle="Những hình ảnh đáng nhớ của bé" /><GalleryScreen /></div> : null}</div>
  </div>;
}
