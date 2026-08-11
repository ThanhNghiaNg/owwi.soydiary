export function TopHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <header className="bg-[#9b55ee] px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white"><div className="text-center text-xl font-extrabold">{title}</div>{subtitle ? <div className="mt-1 text-center text-sm text-white/85">{subtitle}</div> : null}</header>;
}
