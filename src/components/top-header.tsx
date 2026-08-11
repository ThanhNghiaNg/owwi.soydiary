export function TopHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <header className="rounded-b-[2rem] bg-[var(--color-primary)] px-6 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] text-white"><div className="text-center text-xl font-extrabold tracking-tight">{title}</div>{subtitle ? <div className="mt-1 text-center text-sm font-medium text-white/80">{subtitle}</div> : null}</header>;
}
