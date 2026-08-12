"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { ACTIVITIES_KEY, type ActivitiesResponse } from "@/lib/swr";
import { aggregateDashboard } from "./dashboard";
import { BarChart, LineChart } from "./charts";
import { TopHeader } from "@/components/top-header";

const emptyActivities: ActivitiesResponse["activities"] = [];

export function DashboardScreen() {
  const { data: response } = useSWR<ActivitiesResponse>(ACTIVITIES_KEY);
  const activities = response?.activities ?? emptyActivities;

  const data = useMemo(() => aggregateDashboard(activities), [activities]);
  const cards = [
    { title: "Bú mẹ", unit: "phút / ngày", data: data.breastfeedingMinutes, line: false, color: "#3E9B69" },
    { title: "Thay tã", unit: "lần / ngày", data: data.diapers, line: false, color: "#D9773F" },
    { title: "Hút sữa", unit: "ml / ngày", data: data.pumpMl, line: false, color: "#C76582" },
    { title: "Bú bình", unit: "ml / ngày", data: data.bottleMl, line: false, color: "#338D78" },
    { title: "Giấc ngủ", unit: "giờ / ngày", data: data.sleepHours, line: true, color: "#3C83A4" },
    { title: "Nằm sấp", unit: "phút / ngày", data: data.tummyMinutes, line: false, color: "#B98020" },
    { title: "Ăn dặm", unit: "bữa / ngày", data: data.solidCount, line: false, color: "#568B50" },
    { title: "Hoạt động khác", unit: "lần / ngày", data: data.customCount, line: false, color: "#8262BD" },
  ];

  return <div className="app-page">
    <TopHeader title="Thống kê" subtitle="Tổng quan 7 ngày gần nhất" />
    <main className="px-4 py-6 sm:px-6">
      <section className="mb-6 rounded-3xl bg-[var(--color-primary-soft)] p-5">
        <p className="text-sm font-bold text-[var(--color-primary-strong)]">Nhật ký của bé</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <strong className="text-3xl font-black tracking-tight">{activities.length}</strong>
            <span className="ml-2 text-sm text-[var(--color-muted)]">hoạt động đã ghi</span>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-primary-strong)]">7 ngày</span>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => <section key={card.title} className="surface-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">{card.title}</h2>
              <p className="mt-0.5 text-xs font-medium text-[var(--color-muted)]">{card.unit}</p>
            </div>
            <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: card.color }} aria-hidden="true" />
          </div>
          {card.line ? <LineChart data={card.data} unit={card.unit} color={card.color} /> : <BarChart data={card.data} unit={card.unit} color={card.color} />}
        </section>)}
      </div>
    </main>
  </div>;
}
