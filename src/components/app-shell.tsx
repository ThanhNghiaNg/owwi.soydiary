import { BottomNav } from "./bottom-nav";
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full min-w-[300px] max-w-[560px] bg-white shadow-xl"><main className="pb-24">{children}</main><BottomNav /></div>;
}
