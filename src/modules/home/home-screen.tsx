"use client";
import Link from "next/link";
import type { BabyDto } from "@/modules/baby/baby.dto";
import type { ActivityDto } from "@/modules/activity/activity.dto";
import { ACTIVITY_REGISTRY, getActivityMeta } from "@/modules/activity/activity.registry";
import { ActivityAsset } from "@/modules/activity/activity-asset";
import { babyAgeSentence, babyAgeText, formatClock, relativeFromNow } from "@/lib/date";
import { useHomeData } from "./use-home-data";

function detail(activity: ActivityDto) {
  switch (activity.type) {
    case "breastfeeding": return `${Math.floor((activity.leftSeconds + activity.rightSeconds) / 60)}m ${(activity.leftSeconds + activity.rightSeconds) % 60}s`;
    case "bottle": return `${activity.amountOz.toFixed(1)} oz`;
    case "pump": return `${(activity.leftOz + activity.rightOz).toFixed(1)} oz`;
    case "diaper": return activity.diaperType[0]?.toUpperCase() + activity.diaperType.slice(1);
    case "sleep": return `${Math.max(0, Math.round((new Date(activity.endedAt).getTime() - new Date(activity.occurredAt).getTime()) / 3_600_000 * 10) / 10)} hrs`;
    case "tummy": return `${activity.durationMinutes} min`;
    case "solid": return activity.label;
    case "custom": return activity.label;
  }
}

export function HomeScreen({ serverBaby }: { serverBaby: BabyDto }) {
  const { baby, activities, syncing } = useHomeData(serverBaby);
  const b = baby ?? serverBaby;
  return <div className="min-h-dvh bg-[#f4ebff]">
    <header className="bg-[#9b55ee] px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white"><div className="text-center text-xl font-extrabold">{b.name}⌄</div></header>
    <section className="px-5 pt-6 text-center"><h1 className="text-[clamp(2rem,9vw,3rem)] font-black tracking-tight">{babyAgeText(b.birthDate)}</h1><p className="mx-auto mt-8 max-w-sm text-[clamp(1.25rem,6vw,1.7rem)] leading-tight">{babyAgeSentence(b.name, b.birthDate)}</p></section>
    <div className="no-scrollbar mt-8 flex gap-3 overflow-x-auto px-4 pb-3">
      {ACTIVITY_REGISTRY.map((item) => (
        <Link
          key={item.type}
          href={`/app/track/${item.type}`}
          aria-label={`Track ${item.label}`}
          className="group shrink-0 text-center"
        >
          <div
            className="grid h-[78px] w-[78px] place-items-center overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/75 shadow-sm ring-1 ring-black/[0.03] transition duration-150 group-active:scale-[0.97]"
            style={{ boxShadow: `0 10px 24px ${item.accent}24` }}
          >
            <ActivityAsset type={item.type} size={70} className="h-[70px] w-[70px]" />
          </div>
          <div className="mt-1.5 max-w-[78px] truncate text-sm font-medium text-zinc-700">
            {item.shortLabel}
          </div>
        </Link>
      ))}
    </div>
    <section className="mx-4 mt-5 rounded-[1.6rem] bg-white/55 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-extrabold">Recent</h2><span className="text-xs text-zinc-400">{syncing ? "Syncing…" : "Synced"}</span></div>
      <div className="space-y-3">{activities.slice(0, 6).map((a) => { const meta = getActivityMeta(a.type); return <article key={a.id} className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="h-2" style={{ background: meta.accent }}/><div className="p-4"><div className="flex items-start justify-between gap-3"><div className="text-lg">{meta.label}</div><div className="text-right text-sm font-bold">{relativeFromNow(a.occurredAt)}</div></div><div className="mt-4 flex items-end justify-between"><strong className="text-2xl">{formatClock(a.occurredAt)}</strong><span className="text-lg">{detail(a)}</span></div></div></article>; })}{activities.length === 0 ? <div className="rounded-2xl bg-white p-7 text-center text-zinc-500">Chưa có hoạt động. Chạm một ô phía trên để bắt đầu.</div> : null}</div>
      <div className="mt-5 flex justify-between gap-3"><button className="rounded-full bg-[#d6edf7] px-5 py-3 font-bold text-[#20aeb1]">History</button><button className="rounded-full bg-[#d6edf7] px-5 py-3 font-bold text-[#20aeb1]">Customize</button></div>
    </section>
  </div>;
}
