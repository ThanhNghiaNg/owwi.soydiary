"use client";

import Link from "next/link";
import { getActivityMeta } from "@/modules/activity/activity.registry";
import { ActivityAsset } from "@/modules/activity/activity-asset";
import { ActivityImageSyncMedia } from "@/modules/activity/activity-image-sync-status";
import type { ActivityType } from "@/modules/activity/activity.dto";
import { babyAgeSentence, babyAgeText, formatClock, relativeFromNow } from "@/lib/date";
import { ArrowUpRightIcon, CheckIcon } from "@/components/icons";
import { useHomeData } from "./use-home-data";
import { activityDetail } from "@/modules/activity/activity-format";
import { ProfileMenu } from "@/components/profile-menu";
import { useInitialAppData } from "@/components/data-cache-provider";

const homeQuickActivityOrder = [
  "breastfeeding", "bottle", "diaper", "moment", "pump", "solid", "tummy", "custom",
] as const satisfies readonly ActivityType[];
const homeQuickActivities = homeQuickActivityOrder.map(getActivityMeta);

export function HomeScreen() {
  const { baby: initialBaby, account } = useInitialAppData();
  const { baby, activities, syncing } = useHomeData();
  const b = baby ?? initialBaby;

  return <div className="app-page">
    <header className="rounded-b-[2rem] bg-[var(--color-primary)] px-5 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Baby&apos;s Diary</p>
          <p className="mt-0.5 text-xl font-extrabold tracking-tight">Nhật ký của {b.name}</p>
        </div>
        <ProfileMenu accountName={account.name} accountEmail={account.email} />
      </div>
    </header>

    <main className="px-4 pb-6 sm:px-6">
      <section className="surface-card -mt-1 px-5 py-5 text-center sm:px-6">
        <p className="text-sm font-bold text-[var(--color-primary)]">Hôm nay bé được</p>
        <h1 className="mt-1 text-[clamp(2rem,9vw,2.75rem)] font-black tracking-[-0.04em] text-[var(--color-ink)]">{babyAgeText(b.birthDate)}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-muted)]">{babyAgeSentence(b.name, b.birthDate)}</p>
      </section>

      <section className="mt-7" aria-labelledby="quick-track-title">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="quick-track-title" className="text-xl font-extrabold tracking-tight">Ghi nhanh</h2>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">Chạm vào hoạt động vừa diễn ra</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:gap-x-4">
          {homeQuickActivities.map((item) => (
            <Link key={item.type} href={`/app/track/${item.type}`} aria-label={`Ghi hoạt động ${item.label}`} className="group min-w-0 text-center">
              <span className="mx-auto grid aspect-square w-full max-w-[92px] place-items-center overflow-hidden rounded-[1.35rem] border border-[var(--color-border)] bg-white shadow-[0_5px_16px_rgba(58,43,76,0.06)] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-[var(--color-primary)] group-active:translate-y-0 group-active:opacity-80">
                <ActivityAsset type={item.type} size={72} className="h-[76%] w-[76%]" />
              </span>
              <span className="mt-2 block truncate text-xs font-bold text-[var(--color-ink)] sm:text-sm">{item.shortLabel}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="recent-title">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 id="recent-title" className="text-xl font-extrabold tracking-tight">Hoạt động gần đây</h2>
            <div className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${syncing ? "text-[var(--color-muted)]" : "text-[var(--color-accent)]"}`}>
              {!syncing && <CheckIcon className="h-3.5 w-3.5" />}
              {syncing ? "Đang đồng bộ…" : "Đã đồng bộ"}
            </div>
          </div>
          <Link href="/app/dashboard" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-bold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)]">
            Thống kê <ArrowUpRightIcon className="h-4 w-4" />
          </Link>
        </div>

        <div className="space-y-3">
          {activities.slice(0, 3).map((activity) => {
            const meta = getActivityMeta(activity.type);
            return <article key={activity.id} className="surface-card overflow-hidden transition duration-200 hover:border-[var(--color-primary)] focus-within:border-[var(--color-primary)]">
            <Link href={`/app/activity/${activity.id}?from=home`} aria-label={`Xem và sửa ${meta.label} lúc ${formatClock(activity.occurredAt)}`} className="group flex items-center gap-3 p-3.5 transition-colors active:bg-[var(--color-primary-soft)]">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${meta.accent}18` }}>
                <ActivityAsset type={activity.type} size={42} className="h-10 w-10" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="truncate font-extrabold">{meta.label}</h3>
                  <time className="shrink-0 text-xs font-semibold text-[var(--color-muted)]">{relativeFromNow(activity.occurredAt)}</time>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                  <time className="font-bold text-[var(--color-ink)]">{formatClock(activity.occurredAt)}</time>
                  <span className="truncate text-[var(--color-muted)]">{activityDetail(activity)}</span>
                </div>
              </div>
            </Link>
            <ActivityImageSyncMedia
              activity={activity}
              label={`Hình ảnh của ${meta.label} lúc ${formatClock(activity.occurredAt)}`}
              maxThumbnails={1}
              className="border-t border-[var(--color-border)] px-3.5 py-3"
            />
            </article>;
          })}

          {activities.length === 0 ? <div className="surface-card px-6 py-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><CheckIcon className="h-6 w-6" /></div>
            <h3 className="mt-3 font-extrabold">Sẵn sàng ghi hoạt động đầu tiên</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-[var(--color-muted)]">Chọn một ô ở phần “Ghi nhanh” để bắt đầu nhật ký cho bé.</p>
          </div> : null}

          <Link href="/app/history" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-primary)] bg-white px-4 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[var(--color-primary-soft)] active:bg-[#e3daf6]">
            Lịch sử <ArrowUpRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

    </main>
  </div>;
}
