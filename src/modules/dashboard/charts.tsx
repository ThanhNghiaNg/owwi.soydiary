import type { DailyPoint } from "./dashboard";
export function BarChart({ data, unit }: { data: DailyPoint[]; unit: string }) {
  const max = Math.max(1, ...data.map(d=>d.value));
  return <div className="mt-5"><div className="flex h-40 items-end gap-2">{data.map((d,i)=><div key={`${d.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="text-[10px] font-bold text-zinc-500">{d.value ? d.value.toFixed(d.value<10?1:0) : ''}</span><div className="w-full rounded-t-md bg-[#9b55ee]" style={{height:`${Math.max(d.value?6:2,(d.value/max)*120)}px`}}/></div>)}</div><div className="mt-2 flex gap-2">{data.map((d,i)=><span key={`${d.label}-l-${i}`} className="min-w-0 flex-1 text-center text-[10px] text-zinc-400">{d.label}</span>)}</div><div className="mt-1 text-right text-xs text-zinc-400">{unit}</div></div>;
}
export function LineChart({ data, unit }: { data: DailyPoint[]; unit: string }) {
  const max=Math.max(1,...data.map(d=>d.value)); const w=280,h=120; const points=data.map((d,i)=>`${(i/(Math.max(1,data.length-1)))*w},${h-(d.value/max)*(h-12)}`).join(' ');
  return <div className="mt-5"><svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full overflow-visible"><polyline points={points} fill="none" stroke="#20b4b4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{data.map((d,i)=><circle key={i} cx={(i/(Math.max(1,data.length-1)))*w} cy={h-(d.value/max)*(h-12)} r="4" fill="#20b4b4"/>)}</svg><div className="flex">{data.map((d,i)=><span key={i} className="flex-1 text-center text-[10px] text-zinc-400">{d.label}</span>)}</div><div className="mt-1 text-right text-xs text-zinc-400">{unit}</div></div>;
}
