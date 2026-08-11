"use client";
import { useEffect, useMemo, useState } from "react";
import type { ActivityDto } from "@/modules/activity/activity.dto";
import { cacheKeys, readCache, writeCache } from "@/lib/cache";
import { aggregateDashboard } from "./dashboard";
import { BarChart, LineChart } from "./charts";
import { TopHeader } from "@/components/top-header";
export function DashboardScreen({ babyId }: { babyId: string }) {
  const keys = cacheKeys(babyId);
  const [activities,setActivities]=useState<ActivityDto[]>(()=>readCache<ActivityDto[]>(keys.activities)??[]);
  useEffect(()=>{ void fetch('/api/activities',{cache:'no-store'}).then(async r=>{if(!r.ok)return; const j=await r.json() as {activities:ActivityDto[]}; setActivities(j.activities); writeCache(keys.activities,j.activities);}); },[keys.activities]);
  const d=useMemo(()=>aggregateDashboard(activities),[activities]);
  const cards=[
    {title:'Bottle',unit:'oz / day',data:d.bottleOz,line:false},
    {title:'Pump',unit:'oz / day',data:d.pumpOz,line:false},
    {title:'Breastfeeding',unit:'minutes / day',data:d.breastfeedingMinutes,line:false},
    {title:'Sleep',unit:'hours / day',data:d.sleepHours,line:true},
    {title:'Diaper changes',unit:'changes / day',data:d.diapers,line:false},
    {title:'Tummy time',unit:'minutes / day',data:d.tummyMinutes,line:false},
    {title:'Solid food',unit:'meals / day',data:d.solidCount,line:false},
    {title:'Custom activity',unit:'events / day',data:d.customCount,line:false},
  ];
  return <div className="min-h-dvh bg-[#f6f2fb]"><TopHeader title="Dashboard" subtitle="7 ngày gần nhất"/><div className="space-y-4 p-4">{cards.map(c=><section key={c.title} className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-xl font-extrabold">{c.title}</h2>{c.line?<LineChart data={c.data} unit={c.unit}/>:<BarChart data={c.data} unit={c.unit}/>}</section>)}</div></div>;
}
