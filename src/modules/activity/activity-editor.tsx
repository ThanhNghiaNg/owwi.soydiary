"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityInput, ActivityType } from "./activity.dto";
import { getActivityMeta } from "./activity.registry";
import { CalendarIcon, ClockIcon, ChevronLeft } from "@/components/icons";
import { combineLocalDateTime, localDateInputValue, localTimeInputValue } from "@/lib/date";
import { cacheKeys, readCache, writeCache } from "@/lib/cache";
import type { ActivityDto } from "./activity.dto";

type Fields = Record<string, string | number>;
const colors = ["Yellow","Brown","Black","Green","Red","Orange","White"];
const consistencies = ["Sticky","Mushy","Soft","Well-formed","Watery","Hard","Chalky"];

export function ActivityEditor({ type, babyId }: { type: ActivityType; babyId: string }) {
  const router = useRouter(); const meta = getActivityMeta(type);
  const [date, setDate] = useState(localDateInputValue()); const [time, setTime] = useState(localTimeInputValue());
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [fields, setFields] = useState<Fields>(() => type === "bottle" ? { amountOz: 2.9, milkType: "breast-milk" } : type === "pump" ? { leftOz: 3, rightOz: 1.4 } : type === "diaper" ? { diaperType: "poop", color: "Brown", consistency: "Soft" } : type === "tummy" ? { durationMinutes: 0, label: "Tummy Time" } : type === "solid" ? { label: "Solid Food" } : type === "custom" ? { label: "Custom" } : type === "sleep" ? { endDate: localDateInputValue(), endTime: localTimeInputValue() } : { leftSeconds: 0, rightSeconds: 0 });
  const totalBreast = Number(fields.leftSeconds ?? 0) + Number(fields.rightSeconds ?? 0);
  const payload = useMemo<ActivityInput | null>(() => {
    const base = { type, occurredAt: combineLocalDateTime(date, time), note } as const;
    switch (type) {
      case "breastfeeding": return { ...base, type, leftSeconds: Number(fields.leftSeconds), rightSeconds: Number(fields.rightSeconds) };
      case "bottle": return { ...base, type, milkType: String(fields.milkType) as "breast-milk"|"formula"|"other", amountOz: Number(fields.amountOz) };
      case "pump": return { ...base, type, leftOz: Number(fields.leftOz), rightOz: Number(fields.rightOz) };
      case "diaper": return { ...base, type, diaperType: String(fields.diaperType) as "pee"|"poop"|"mixed"|"dry", color: String(fields.color || ""), consistency: String(fields.consistency || "") };
      case "sleep": return { ...base, type, endedAt: combineLocalDateTime(String(fields.endDate), String(fields.endTime)) };
      case "tummy": return { ...base, type, durationMinutes: Number(fields.durationMinutes), label: String(fields.label) };
      case "solid": return { ...base, type, label: String(fields.label) };
      case "custom": return { ...base, type, label: String(fields.label) };
    }
  }, [date, fields, note, time, type]);
  const field = useCallback((name: string, value: string | number) => { setFields((prev) => ({ ...prev, [name]: value })); }, []);
  async function save() {
    if (!payload) return; setBusy(true); setError("");
    try {
      const res = await fetch("/api/activities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { setError("Không thể lưu hoạt động. Kiểm tra dữ liệu và thử lại."); return; }
      const json = await res.json() as { activity: ActivityDto };
      const keys = cacheKeys(babyId);
      const cached = readCache<ActivityDto[]>(keys.activities) ?? [];
      writeCache(keys.activities, [json.activity, ...cached].slice(0, 100));
      router.replace("/app"); router.refresh();
    } finally { setBusy(false); }
  }
  const DateTime = () => <div className="space-y-5 px-5 pt-5"><div className="flex items-center gap-4"><CalendarIcon className="h-8 w-8 shrink-0"/><b className="text-2xl">Date</b><input aria-label="Date" value={date} onChange={(e)=>setDate(e.target.value)} type="date" className="ml-auto min-w-0 max-w-[190px] rounded-2xl bg-zinc-100 px-3 py-2 text-lg font-bold"/></div><div className="flex items-center gap-4"><ClockIcon className="h-8 w-8 shrink-0"/><b className="text-2xl">Time</b><input aria-label="Time" value={time} onChange={(e)=>setTime(e.target.value)} type="time" className="ml-auto min-w-0 max-w-[135px] rounded-2xl bg-zinc-100 px-3 py-2 text-lg font-bold"/></div></div>;
  return <div className="min-h-dvh bg-[#fafafa] pb-8"><header className="flex items-center bg-[#9b55ee] px-3 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white"><button onClick={()=>router.back()} className="p-2" aria-label="Back"><ChevronLeft className="h-8 w-8"/></button><h1 className="flex-1 pr-10 text-center text-xl font-extrabold">{type === "diaper" ? "Track Baby's Diapers" : type === "breastfeeding" || type === "bottle" || type === "pump" ? "Track Baby's Feedings" : "Track Baby's Routine"}</h1></header>
    {(type === "breastfeeding" || type === "bottle" || type === "pump") ? <div className="grid grid-cols-3 border-b bg-white text-center text-lg"><button onClick={()=>router.replace('/app/track/breastfeeding')} className={`py-3 ${type==='breastfeeding'?'border-b-4 border-[#20b4b4] font-bold text-[#20b4b4]':''}`}>Breastfeeding</button><button onClick={()=>router.replace('/app/track/bottle')} className={`py-3 ${type==='bottle'?'border-b-4 border-[#20b4b4] font-bold text-[#20b4b4]':''}`}>Bottle</button><button onClick={()=>router.replace('/app/track/pump')} className={`py-3 ${type==='pump'?'border-b-4 border-[#20b4b4] font-bold text-[#20b4b4]':''}`}>Pump</button></div> : null}
    <DateTime />
    <div className="px-5 pt-8">
      {type === "breastfeeding" ? <BreastFields left={Number(fields.leftSeconds)} right={Number(fields.rightSeconds)} setField={field} total={totalBreast}/> : null}
      {type === "bottle" ? <BottleFields fields={fields} setField={field}/> : null}
      {type === "pump" ? <PumpFields fields={fields} setField={field}/> : null}
      {type === "diaper" ? <DiaperFields fields={fields} setField={field}/> : null}
      {type === "sleep" ? <SleepFields fields={fields} setField={field}/> : null}
      {type === "tummy" ? <TummyFields fields={fields} setField={field}/> : null}
      {type === "solid" || type === "custom" ? <LabelField fields={fields} setField={field} placeholder={meta.label}/> : null}
      <label className="mt-8 block"><span className="mb-3 block text-xl font-extrabold">Notes</span><textarea value={note} onChange={(e)=>setNote(e.target.value)} className="h-28 w-full resize-none rounded-2xl border border-zinc-300 bg-white p-4 text-lg outline-none focus:border-[#20b4b4]" placeholder="Add a Note"/></label>
      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
      <button onClick={save} disabled={busy || (type==='breastfeeding' && totalBreast===0)} className="mt-7 w-full rounded-full bg-[#20b4b4] py-4 text-xl font-extrabold text-white disabled:bg-zinc-200 disabled:text-zinc-500">{busy ? "Saving…" : "Save"}</button>
    </div>
  </div>;
}

function BreastFields({left,right,total,setField}:{left:number;right:number;total:number;setField:(n:string,v:number)=>void}) {
  const [running, setRunning] = useState<"left"|"right"|null>(null);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (running === "left") setField("leftSeconds", left + 1);
      else setField("rightSeconds", right + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [left, right, running, setField]);
  return <div><div className="text-center"><div className="text-5xl font-black">{fmt(total)}</div><div className="text-lg">min&nbsp;&nbsp;&nbsp;sec</div></div><div className="mt-8 grid grid-cols-2 gap-6"><TimerButton label="L" seconds={left} active={running==='left'} onClick={()=>setRunning((r)=>r==='left'?null:'left')}/><TimerButton label="R" seconds={right} active={running==='right'} onClick={()=>setRunning((r)=>r==='right'?null:'right')}/></div></div>;
}
function TimerButton({label,seconds,active,onClick}:{label:string;seconds:number;active:boolean;onClick:()=>void}) { return <div className="text-center"><div className="mb-2 text-2xl">{fmt(seconds)}</div><button onClick={onClick} className="mx-auto grid h-32 w-32 max-w-full place-items-center rounded-full border-8 border-zinc-200 bg-[#fff0e8] text-5xl font-black text-[#9b55ee]">{active?'Ⅱ':'▶'}</button><div className="mt-4 text-3xl font-black">{label}</div></div>; }
function fmt(s:number){ const m=Math.floor(s/60); return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function BottleFields({fields,setField}:{fields:Fields;setField:(n:string,v:string|number)=>void}) { return <div><div className="flex items-center justify-between"><select value={String(fields.milkType)} onChange={(e)=>setField('milkType',e.target.value)} className="bg-transparent text-xl font-extrabold text-[#20b4b4]"><option value="breast-milk">Breast milk</option><option value="formula">Formula</option><option value="other">Other</option></select><div><span className="text-5xl font-black text-[#20b4b4]">{Number(fields.amountOz).toFixed(1)}</span> oz</div></div><input type="range" min="0" max="10" step="0.1" value={Number(fields.amountOz)} onChange={(e)=>setField('amountOz',Number(e.target.value))} className="mt-12 w-full accent-[#20b4b4]"/><div className="mt-3 flex justify-between font-bold"><span>0 oz</span><span>5 oz</span><span>10 oz</span></div></div>; }
function PumpFields({fields,setField}:{fields:Fields;setField:(n:string,v:number)=>void}) { const total=Number(fields.leftOz)+Number(fields.rightOz); return <div><div className="text-center text-4xl font-black">{total.toFixed(1)} <small className="text-xl font-normal">oz</small></div><div className="mt-8 grid grid-cols-2 gap-6"><AmountSlider label="L" value={Number(fields.leftOz)} onChange={(v)=>setField('leftOz',v)}/><AmountSlider label="R" value={Number(fields.rightOz)} onChange={(v)=>setField('rightOz',v)}/></div></div>; }
function AmountSlider({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}) { return <div className="text-center"><div className="text-4xl font-black text-[#20b4b4]">{value.toFixed(1)}</div><input className="mt-8 w-full accent-[#20b4b4]" type="range" min="0" max="8" step="0.1" value={value} onChange={(e)=>onChange(Number(e.target.value))}/><div className="mt-4 text-3xl font-black">{label}</div></div>; }
function DiaperFields({fields,setField}:{fields:Fields;setField:(n:string,v:string)=>void}) { const t=String(fields.diaperType); return <div><div className="grid grid-cols-4 gap-2">{['pee','poop','mixed','dry'].map((x)=><button key={x} onClick={()=>setField('diaperType',x)} className={`rounded-full border-4 p-3 text-sm font-bold capitalize ${t===x?'border-[#20b4b4] bg-[#fff4e8]':'border-transparent bg-zinc-100'}`}>{x}</button>)}</div>{t==='poop'||t==='mixed'?<><OptionRow title="Color" options={colors} selected={String(fields.color)} onPick={(v)=>setField('color',v)}/><OptionRow title="Consistency" options={consistencies} selected={String(fields.consistency)} onPick={(v)=>setField('consistency',v)}/></>:null}</div>; }
function OptionRow({title,options,selected,onPick}:{title:string;options:string[];selected:string;onPick:(v:string)=>void}) { return <div className="mt-7"><h3 className="mb-3 text-xl font-extrabold">{title}</h3><div className="no-scrollbar flex gap-2 overflow-x-auto">{options.map((o)=><button key={o} onClick={()=>onPick(o)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${selected===o?'bg-[#20b4b4] text-white':'bg-zinc-100'}`}>{o}</button>)}</div></div>; }
function SleepFields({fields,setField}:{fields:Fields;setField:(n:string,v:string)=>void}) { return <div><h3 className="mb-4 text-xl font-extrabold">Woke Up</h3><div className="grid grid-cols-2 gap-3"><input type="date" value={String(fields.endDate)} onChange={(e)=>setField('endDate',e.target.value)} className="rounded-2xl bg-zinc-100 p-3 font-bold"/><input type="time" value={String(fields.endTime)} onChange={(e)=>setField('endTime',e.target.value)} className="rounded-2xl bg-zinc-100 p-3 font-bold"/></div><p className="mt-4 text-zinc-500">Enter the beginning and end of your baby's sleep.</p><LabelField fields={{label:'Sleep'}} setField={()=>{}} placeholder="Sleep" disabled/></div>; }
function TummyFields({fields,setField}:{fields:Fields;setField:(n:string,v:string|number)=>void}) { return <div><label className="flex items-center gap-4"><b className="text-xl">Total Time</b><input type="number" min="0" max="600" value={Number(fields.durationMinutes)} onChange={(e)=>setField('durationMinutes',Number(e.target.value))} className="ml-auto w-36 rounded-2xl bg-zinc-100 p-3 text-right text-xl font-bold"/><span>min</span></label><LabelField fields={fields} setField={setField} placeholder="Tummy Time"/></div>; }
function LabelField({fields,setField,placeholder,disabled=false}:{fields:Fields;setField:(n:string,v:string)=>void;placeholder:string;disabled?:boolean}) { return <label className="mt-7 block"><span className="mb-3 block text-xl font-extrabold">Display in Timeline as</span><input disabled={disabled} value={String(fields.label ?? placeholder)} onChange={(e)=>setField('label',e.target.value)} className="w-full rounded-2xl border border-zinc-300 bg-white p-4 text-lg font-bold disabled:text-zinc-400" placeholder={placeholder}/></label>; }
