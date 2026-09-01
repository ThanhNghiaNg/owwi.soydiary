"use client";

import { useCallback, useEffect, useState } from "react";
import type { StorageConnectionSummary, StorageSettingsSummary } from "./domain/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function StorageManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<StorageSettingsSummary>();
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [disconnecting, setDisconnecting] = useState<StorageConnectionSummary>();
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/integrations/storage", { cache: "no-store" }); if (!response.ok) throw new Error(); setSettings(await response.json() as StorageSettingsSummary); } catch { setError("Chưa thể tải thông tin storage."); } finally { setLoading(false); } }, []);
  useEffect(() => { if (!open) return; const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [open, load]);
  useEffect(() => { if (!open) return; const listener = (event: MessageEvent) => { if (event.origin !== window.location.origin) return; const type = (event.data as { type?: string })?.type; if (type === "soyplay:cloudinary-oauth" || type === "soyplay:google-drive-oauth") void load(); }; window.addEventListener("message", listener); return () => window.removeEventListener("message", listener); }, [open, load]);
  if (!open) return null;
  async function activate(connection: StorageConnectionSummary) { setBusyId(connection.id); setError(""); try { const response = await fetch(`/api/integrations/storage/connections/${encodeURIComponent(connection.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: true }) }); if (!response.ok) throw new Error(); setSettings(await response.json() as StorageSettingsSummary); } catch { setError("Chưa thể đổi storage đang dùng."); } finally { setBusyId(""); } }
  async function disconnect() { if (!disconnecting) return; setBusyId(disconnecting.id); setError(""); try { const response = await fetch(`/api/integrations/storage/connections/${encodeURIComponent(disconnecting.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(); setSettings(await response.json() as StorageSettingsSummary); setDisconnecting(undefined); } catch { setError("Chưa thể ngắt kết nối storage."); } finally { setBusyId(""); } }
  function connect(provider: "cloudinary" | "google-drive") { window.open(`/api/integrations/${provider}/connect`, `soydiary-${provider}`, "popup,width=620,height=760"); }
  return <div className="dialog-backdrop fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="storage-title" className="dialog-panel max-h-[min(760px,90dvh)] w-full max-w-lg overflow-y-auto rounded-[1.75rem] bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 id="storage-title" className="text-xl font-black">Quản lý storage</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Chọn nơi lưu hình ảnh của nhật ký.</p></div><button type="button" onClick={onClose} aria-label="Đóng" className="grid h-11 w-11 place-items-center rounded-xl bg-[#f2eff5] text-xl">×</button></div>
      {loading ? <p className="py-8 text-center text-sm text-[var(--color-muted)]">Đang tải…</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p> : null}
      {settings ? <div className="mt-5 space-y-4">{settings.providers.map((provider) => <article key={provider.id} className="rounded-2xl border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-extrabold">{provider.id === "cloudinary" ? "Cloudinary" : "Google Drive"}</h3><p className="text-xs text-[var(--color-muted)]">{provider.connections.length ? `${provider.connections.length} kết nối` : "Chưa kết nối"}</p></div><button type="button" disabled={!provider.configured} onClick={() => connect(provider.id)} className="min-h-11 rounded-xl bg-[var(--color-primary-soft)] px-3 text-sm font-extrabold text-[var(--color-primary-strong)] disabled:opacity-50">Thêm kết nối</button></div>
        {!provider.configured ? <p className="mt-3 text-xs text-[var(--color-danger)]">Nhà cung cấp này chưa được cấu hình trên server.</p> : null}
        <div className="mt-3 space-y-2">{provider.connections.map((connection) => <div key={connection.id} className={`rounded-xl border p-3 ${connection.active ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]"}`}><div className="flex items-center gap-2"><button type="button" disabled={connection.active || Boolean(busyId) || connection.health !== "connected"} onClick={() => void activate(connection)} className="min-h-11 min-w-0 flex-1 text-left"><span className="block truncate text-sm font-extrabold">{connection.label}</span><span className="text-xs text-[var(--color-muted)]">{connection.active ? "Đang sử dụng" : connection.health === "connected" ? "Chạm để sử dụng" : "Cần kết nối lại"}</span></button><button type="button" disabled={Boolean(busyId)} onClick={() => setDisconnecting(connection)} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[var(--color-danger)]">Ngắt</button></div></div>)}</div>
      </article>)}</div> : null}
    </section>
    <ConfirmDialog open={Boolean(disconnecting)} title="Ngắt kết nối storage?" description="Các ảnh đã lưu vẫn còn trên nhà cung cấp. Bạn sẽ không thể tải ảnh mới lên kết nối này." confirmLabel={busyId ? "Đang ngắt…" : "Ngắt kết nối"} cancelLabel="Giữ lại" tone="danger" confirmDisabled={Boolean(busyId)} cancelDisabled={Boolean(busyId)} onConfirm={() => void disconnect()} onClose={() => { if (!busyId) setDisconnecting(undefined); }} />
  </div>;
}
