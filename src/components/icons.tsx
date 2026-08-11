type IconProps = { className?: string };
const base = "fill-none stroke-current stroke-[1.8]";
export function CalendarIcon({ className = "h-7 w-7" }: IconProps) { return <svg viewBox="0 0 24 24" className={className}><rect x="3" y="5" width="18" height="16" rx="2" className={base}/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M11 14h2M15 14h2M7 18h2M11 18h2" className={base}/></svg>; }
export function ClockIcon({ className = "h-7 w-7" }: IconProps) { return <svg viewBox="0 0 24 24" className={className}><circle cx="12" cy="12" r="9" className={base}/><path d="M12 7v6H8" className={base}/></svg>; }
export function ChevronLeft({ className = "h-6 w-6" }: IconProps) { return <svg viewBox="0 0 24 24" className={className}><path d="m15 5-7 7 7 7" className={base}/></svg>; }
export function HomeIcon({ className = "h-6 w-6" }: IconProps) { return <svg viewBox="0 0 24 24" className={className}><path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4z" className={base}/></svg>; }
export function ChartIcon({ className = "h-6 w-6" }: IconProps) { return <svg viewBox="0 0 24 24" className={className}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" className={base}/></svg>; }
export function SparkIcon({ className = "h-6 w-6" }: IconProps) { return <svg viewBox="0 0 24 24" className={className}><path d="m12 2 1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" className={base}/></svg>; }
