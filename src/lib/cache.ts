export function cacheKeys(babyId: string) {
  return { baby: `babytrack:baby:v1:${babyId}`, activities: `babytrack:activities:v1:${babyId}` } as const;
}
export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
export function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be disabled */ }
}
