import type { ActivityDto } from "@/modules/activity/activity.dto";
export type DailyPoint = { label: string; value: number };
export type DashboardData = { bottleOz: DailyPoint[]; pumpOz: DailyPoint[]; breastfeedingMinutes: DailyPoint[]; sleepHours: DailyPoint[]; diapers: DailyPoint[]; tummyMinutes: DailyPoint[]; solidCount: DailyPoint[]; customCount: DailyPoint[] };

export function aggregateDashboard(activities: ActivityDto[], days = 7): DashboardData {
  const dates = Array.from({length:days},(_,i)=>{ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(days-1-i)); return d; });
  const labels = dates.map(d=>new Intl.DateTimeFormat('en',{weekday:'short'}).format(d));
  const buckets = dates.map(d=>d.toISOString().slice(0,10));
  const make = () => buckets.map((_,i)=>({label:labels[i] ?? '', value:0}));
  const out: DashboardData = { bottleOz:make(), pumpOz:make(), breastfeedingMinutes:make(), sleepHours:make(), diapers:make(), tummyMinutes:make(), solidCount:make(), customCount:make() };
  for (const a of activities) {
    const local = new Date(a.occurredAt); local.setMinutes(local.getMinutes()-local.getTimezoneOffset());
    const idx = buckets.indexOf(local.toISOString().slice(0,10)); if (idx<0) continue;
    if (a.type==='bottle') out.bottleOz[idx]!.value += a.amountOz;
    if (a.type==='pump') out.pumpOz[idx]!.value += a.leftOz+a.rightOz;
    if (a.type==='breastfeeding') out.breastfeedingMinutes[idx]!.value += (a.leftSeconds+a.rightSeconds)/60;
    if (a.type==='sleep') out.sleepHours[idx]!.value += Math.max(0,new Date(a.endedAt).getTime()-new Date(a.occurredAt).getTime())/3_600_000;
    if (a.type==='diaper') out.diapers[idx]!.value += 1;
    if (a.type==='tummy') out.tummyMinutes[idx]!.value += a.durationMinutes;
    if (a.type==='solid') out.solidCount[idx]!.value += 1;
    if (a.type==='custom') out.customCount[idx]!.value += 1;
  }
  return out;
}
