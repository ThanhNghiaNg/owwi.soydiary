"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { CheckIcon, CloudIcon, XIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type {
  StorageConnectionSummary,
  StorageProviderId,
  StorageProviderSummary,
  StorageSettingsSummary,
} from "./domain/types";

export const STORAGE_MANAGER_OPEN_EVENT = "soydiary:open-storage-manager";

export type StorageManagerOpenReason =
  | "manage"
  | "connection-required"
  | "reconnect-required";

export type StorageManagerOpenOptions = {
  reason?: StorageManagerOpenReason;
  returnFocus?: HTMLElement | null;
};

type ProviderFeedback = {
  tone: "error" | "pending" | "success";
  message: string;
};

type ProviderMeta = {
  name: string;
  description: string;
  Mark: ComponentType;
  markClassName: string;
};

const providerMeta: Record<StorageProviderId, ProviderMeta> = {
  cloudinary: {
    name: "Cloudinary",
    description: "Tối ưu và phân phối ảnh nhanh cho nhật ký.",
    Mark: CloudinaryMark,
    markClassName: "bg-[#eaf4ff] text-[#005bea]",
  },
  "google-drive": {
    name: "Google Drive",
    description: "Lưu ảnh vào tài khoản Google Drive của bạn.",
    Mark: GoogleDriveMark,
    markClassName: "bg-[#edf7ef]",
  },
};

export function openStorageManager(options: StorageManagerOpenOptions = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<StorageManagerOpenOptions>(STORAGE_MANAGER_OPEN_EVENT, {
      detail: options,
    }),
  );
}

/** Mount once inside AppShell so any protected screen can open storage settings. */
export function StorageManagerHost() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<StorageManagerOpenReason>("manage");
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<StorageManagerOpenOptions>).detail;
      const currentFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setReturnFocus(detail?.returnFocus ?? currentFocus);
      setReason(detail?.reason ?? "manage");
      setOpen(true);
    }

    window.addEventListener(STORAGE_MANAGER_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(STORAGE_MANAGER_OPEN_EVENT, handleOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      if (returnFocus?.isConnected) returnFocus.focus();
    });
  }, [returnFocus]);

  return <StorageManager open={open} reason={reason} onClose={close} />;
}

export function StorageManager({
  open,
  reason = "manage",
  onClose,
}: {
  open: boolean;
  reason?: StorageManagerOpenReason;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<StorageSettingsSummary>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: "activate" | "disconnect" }>();
  const [connectingProvider, setConnectingProvider] = useState<StorageProviderId>();
  const [error, setError] = useState("");
  const [providerFeedback, setProviderFeedback] = useState<
    Partial<Record<StorageProviderId, ProviderFeedback>>
  >({});
  const [disconnecting, setDisconnecting] = useState<StorageConnectionSummary>();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const popupMonitorRef = useRef<number | undefined>(undefined);
  const oauthResultReceivedRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  const updateProviderFeedback = useCallback(
    (provider: StorageProviderId, feedback: ProviderFeedback) => {
      setProviderFeedback((current) => ({ ...current, [provider]: feedback }));
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/storage", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setSettings((await response.json()) as StorageSettingsSummary);
    } catch {
      setError("Chưa thể tải thông tin nơi lưu ảnh. Hãy kiểm tra kết nối rồi thử lại.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; status?: string; message?: string };
      const provider = providerFromOAuthMessage(data.type);
      if (!provider) return;

      oauthResultReceivedRef.current = true;
      if (popupMonitorRef.current !== undefined) {
        window.clearInterval(popupMonitorRef.current);
        popupMonitorRef.current = undefined;
      }
      setConnectingProvider(undefined);

      if (data.status === "connected") {
        updateProviderFeedback(provider, {
          tone: "success",
          message: `Đã kết nối ${providerMeta[provider].name} và chọn làm nơi lưu ảnh.`,
        });
        void load();
        return;
      }

      updateProviderFeedback(provider, {
        tone: "error",
        message: friendlyOAuthError(provider, data.message),
      });
    }

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [load, updateProviderFeedback]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (disconnecting) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || !panelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [disconnecting, onClose, open]);

  useEffect(() => () => {
    if (popupMonitorRef.current !== undefined) {
      window.clearInterval(popupMonitorRef.current);
    }
  }, []);

  if (!open) return null;

  async function activate(connection: StorageConnectionSummary) {
    setBusy({ id: connection.id, action: "activate" });
    setError("");
    try {
      const response = await fetch(
        `/api/integrations/storage/connections/${encodeURIComponent(connection.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ active: true }),
        },
      );
      if (!response.ok) throw new Error();
      setSettings((await response.json()) as StorageSettingsSummary);
      updateProviderFeedback(connection.provider, {
        tone: "success",
        message: `${providerMeta[connection.provider].name} đang là nơi lưu ảnh mới.`,
      });
    } catch {
      updateProviderFeedback(connection.provider, {
        tone: "error",
        message: `Chưa thể chọn ${providerMeta[connection.provider].name}. Hãy thử lại.`,
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function disconnect() {
    if (!disconnecting) return;
    const connection = disconnecting;
    setBusy({ id: connection.id, action: "disconnect" });
    setError("");
    try {
      const response = await fetch(
        `/api/integrations/storage/connections/${encodeURIComponent(connection.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      setSettings((await response.json()) as StorageSettingsSummary);
      setDisconnecting(undefined);
      updateProviderFeedback(connection.provider, {
        tone: "success",
        message: `Đã ngắt kết nối ${providerMeta[connection.provider].name}.`,
      });
    } catch {
      updateProviderFeedback(connection.provider, {
        tone: "error",
        message: `Chưa thể ngắt kết nối ${providerMeta[connection.provider].name}. Hãy thử lại.`,
      });
    } finally {
      setBusy(undefined);
    }
  }

  function connect(provider: StorageProviderId) {
    const meta = providerMeta[provider];
    setError("");
    oauthResultReceivedRef.current = false;
    updateProviderFeedback(provider, {
      tone: "pending",
      message: `Đang mở cửa sổ kết nối ${meta.name}…`,
    });

    const popup = window.open(
      `/api/integrations/${provider}/connect`,
      `soydiary-${provider}`,
      "popup,width=620,height=760",
    );
    if (!popup) {
      updateProviderFeedback(provider, {
        tone: "error",
        message: `Trình duyệt đang chặn cửa sổ ${meta.name}. Hãy cho phép popup rồi thử lại.`,
      });
      return;
    }

    setConnectingProvider(provider);
    if (popupMonitorRef.current !== undefined) {
      window.clearInterval(popupMonitorRef.current);
    }
    popupMonitorRef.current = window.setInterval(() => {
      if (!popup.closed) return;
      if (popupMonitorRef.current !== undefined) {
        window.clearInterval(popupMonitorRef.current);
        popupMonitorRef.current = undefined;
      }
      setConnectingProvider(undefined);
      if (!oauthResultReceivedRef.current) {
        updateProviderFeedback(provider, {
          tone: "error",
          message: `Cửa sổ ${meta.name} đã đóng trước khi kết nối hoàn tất. Hãy thử lại.`,
        });
      }
    }, 500);
  }

  const activeConnection = settings?.activeConnection;
  const reasonMessage = storageReasonMessage(reason);

  return <>
    <div
      className="dialog-backdrop fixed inset-0 z-[55] flex items-end justify-center bg-[#211a2b]/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disconnecting) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={loading || Boolean(busy) || Boolean(connectingProvider)}
        aria-hidden={Boolean(disconnecting)}
        className="dialog-panel safe-bottom relative max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-[var(--color-border)] bg-white px-5 pb-6 pt-5 text-[var(--color-ink)] shadow-[0_24px_64px_rgba(31,22,43,0.28)] sm:rounded-[2rem] sm:px-6"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Đóng quản lý nơi lưu ảnh"
          className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-xl text-[var(--color-muted)] transition-colors hover:bg-[#f4f1f7] active:bg-[#eae4ef]"
        >
          <XIcon className="h-5 w-5" />
        </button>

        <div className="pr-14">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--color-primary)]">
            Hình ảnh nhật ký
          </p>
          <h2 id={titleId} className="mt-1 text-2xl font-black tracking-tight">
            Nơi lưu ảnh
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Ảnh mới chỉ được tải lên dịch vụ đang chọn sau khi bạn bấm Lưu hoạt động.
          </p>
        </div>

        {reasonMessage ? <div className="mt-4 rounded-2xl border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-4">
          <p className="text-sm font-bold leading-6 text-[var(--color-primary-strong)]">{reasonMessage}</p>
        </div> : null}

        {loading && !settings ? <div role="status" className="mt-5 rounded-2xl border border-[var(--color-border)] px-4 py-6 text-center text-sm font-semibold text-[var(--color-muted)]">
          Đang tải các nơi lưu ảnh…
        </div> : null}

        {error ? <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-[var(--color-danger)]">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 min-h-11 rounded-xl px-3 text-sm font-extrabold text-[var(--color-danger)] transition-colors hover:bg-red-100">
            Tải lại
          </button>
        </div> : null}

        {settings ? <>
          <ActiveStorageSummary connection={activeConnection} />
          <div className="mt-5 space-y-4">
            {settings.providers.map((provider) => <ProviderCard
              key={provider.id}
              provider={provider}
              feedback={providerFeedback[provider.id]}
              busy={busy}
              connecting={connectingProvider === provider.id}
              oauthBusy={Boolean(connectingProvider)}
              onActivate={(connection) => void activate(connection)}
              onConnect={() => connect(provider.id)}
              onDisconnect={setDisconnecting}
            />)}
          </div>
        </> : null}
      </section>
    </div>

    <ConfirmDialog
      open={Boolean(disconnecting)}
      title={`Ngắt kết nối ${disconnecting ? providerMeta[disconnecting.provider].name : "nơi lưu ảnh"}?`}
      description="Các ảnh đã lưu vẫn còn trên nhà cung cấp. Bạn sẽ không thể tải ảnh mới lên kết nối này."
      confirmLabel={busy?.action === "disconnect" ? "Đang ngắt…" : "Ngắt kết nối"}
      cancelLabel="Giữ lại"
      tone="danger"
      confirmDisabled={Boolean(busy)}
      cancelDisabled={Boolean(busy)}
      onConfirm={() => void disconnect()}
      onClose={() => {
        if (!busy) setDisconnecting(undefined);
      }}
    />
  </>;
}

function ActiveStorageSummary({ connection }: { connection: StorageConnectionSummary | undefined }) {
  if (!connection) {
    return <div role="status" className="mt-5 flex gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-canvas)] p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[var(--color-muted)]" aria-hidden="true">
        <CloudIcon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-extrabold">Chưa có nơi lưu ảnh</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--color-muted)]">
          Kết nối Cloudinary hoặc Google Drive ở bên dưới để lưu hoạt động có ảnh.
        </p>
      </div>
    </div>;
  }

  const meta = providerMeta[connection.provider];
  const healthy = connection.health === "connected";
  return <div role="status" className={`mt-5 flex gap-3 rounded-2xl border p-4 ${healthy ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${meta.markClassName}`} aria-hidden="true">
      <meta.Mark />
    </span>
    <div className="min-w-0">
      <p className={`text-xs font-extrabold uppercase tracking-[0.08em] ${healthy ? "text-emerald-700" : "text-[var(--color-danger)]"}`}>
        {healthy ? "Nơi lưu đang dùng" : "Cần kết nối lại"}
      </p>
      <p className="mt-0.5 truncate text-sm font-black">{meta.name} · {connection.label}</p>
    </div>
  </div>;
}

function ProviderCard({
  provider,
  feedback,
  busy,
  connecting,
  oauthBusy,
  onActivate,
  onConnect,
  onDisconnect,
}: {
  provider: StorageProviderSummary;
  feedback: ProviderFeedback | undefined;
  busy: { id: string; action: "activate" | "disconnect" } | undefined;
  connecting: boolean;
  oauthBusy: boolean;
  onActivate: (connection: StorageConnectionSummary) => void;
  onConnect: () => void;
  onDisconnect: (connection: StorageConnectionSummary) => void;
}) {
  const meta = providerMeta[provider.id];
  const headingId = `storage-provider-${provider.id}`;
  const active = provider.connections.some((connection) => connection.active);
  const connectLabel = provider.connections.length
    ? `Thêm tài khoản ${meta.name}`
    : `Kết nối ${meta.name}`;

  return <article aria-labelledby={headingId} className={`overflow-hidden rounded-3xl border bg-white ${active ? "border-[var(--color-primary)] shadow-[0_8px_24px_rgba(82,53,158,0.10)]" : "border-[var(--color-border)]"}`}>
    <div className="flex items-start gap-3 p-4 sm:p-5">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${meta.markClassName}`} aria-hidden="true">
        <meta.Mark />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={headingId} className="text-base font-black">{meta.name}</h3>
          {active ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2 py-1 text-[0.68rem] font-extrabold text-[var(--color-primary-strong)]">
            <CheckIcon className="h-3.5 w-3.5" /> Đang dùng
          </span> : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{meta.description}</p>
      </div>
    </div>

    <div className="border-t border-[var(--color-border)] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-[var(--color-muted)]">
          {provider.connections.length
            ? `${provider.connections.length} tài khoản đã kết nối`
            : `Chưa kết nối ${meta.name}`}
        </p>
        <button
          type="button"
          disabled={!provider.configured || oauthBusy || Boolean(busy)}
          onClick={onConnect}
          aria-label={connectLabel}
          className="min-h-11 rounded-xl bg-[var(--color-primary-soft)] px-3 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[#e3daf6] active:bg-[#d9cef2] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {connecting ? "Đang kết nối…" : provider.connections.length ? "Thêm tài khoản" : "Kết nối"}
        </button>
      </div>

      {!provider.configured ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold leading-5 text-[var(--color-danger)]">
        {meta.name} chưa được cấu hình trên máy chủ. Vui lòng liên hệ quản trị viên.
      </p> : null}

      {feedback ? <p
        role={feedback.tone === "error" ? "alert" : "status"}
        aria-live={feedback.tone === "error" ? "assertive" : "polite"}
        className={`mt-3 rounded-xl p-3 text-xs font-bold leading-5 ${feedbackClassName(feedback.tone)}`}
      >
        {feedback.message}
      </p> : null}

      {provider.connections.length ? <div className="mt-3 space-y-3">
        {provider.connections.map((connection) => <ConnectionCard
          key={connection.id}
          connection={connection}
          providerName={meta.name}
          busy={busy}
          oauthBusy={oauthBusy}
          onActivate={() => onActivate(connection)}
          onReconnect={onConnect}
          onDisconnect={() => onDisconnect(connection)}
        />)}
      </div> : <p className="mt-3 rounded-xl bg-[var(--color-canvas)] px-3 py-4 text-xs leading-5 text-[var(--color-muted)]">
        Bấm <span className="font-extrabold text-[var(--color-ink)]">Kết nối</span> để cấp quyền lưu ảnh cho {meta.name}.
      </p>}
    </div>
  </article>;
}

function ConnectionCard({
  connection,
  providerName,
  busy,
  oauthBusy,
  onActivate,
  onReconnect,
  onDisconnect,
}: {
  connection: StorageConnectionSummary;
  providerName: string;
  busy: { id: string; action: "activate" | "disconnect" } | undefined;
  oauthBusy: boolean;
  onActivate: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const healthy = connection.health === "connected";
  const detail = [connection.accountLabel, connection.resourceLabel]
    .filter((value): value is string => Boolean(value && value !== connection.label))
    .join(" · ");
  const isBusy = busy?.id === connection.id;

  return <div className={`rounded-2xl border p-3 ${connection.active ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/50" : "border-[var(--color-border)]"}`}>
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold">{connection.label}</p>
        {detail ? <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{detail}</p> : null}
      </div>
      <span className={`shrink-0 rounded-full px-2 py-1 text-[0.68rem] font-extrabold ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-[var(--color-danger)]"}`}>
        {healthy ? connection.active ? "Đang dùng" : "Đã kết nối" : "Cần kết nối lại"}
      </span>
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      {!healthy ? <button
        type="button"
        disabled={Boolean(busy) || oauthBusy}
        onClick={onReconnect}
        aria-label={`Kết nối lại ${providerName} cho ${connection.label}`}
        className="min-h-11 flex-1 rounded-xl bg-[var(--color-primary)] px-3 text-xs font-extrabold text-white transition-colors hover:bg-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Kết nối lại
      </button> : null}
      {healthy && !connection.active ? <button
        type="button"
        disabled={Boolean(busy) || oauthBusy}
        onClick={onActivate}
        aria-label={`Dùng ${connection.label} trên ${providerName} làm nơi lưu ảnh`}
        className="min-h-11 flex-1 rounded-xl bg-[var(--color-primary)] px-3 text-xs font-extrabold text-white transition-colors hover:bg-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isBusy && busy?.action === "activate" ? "Đang chọn…" : "Dùng làm nơi lưu"}
      </button> : null}
      <button
        type="button"
        disabled={Boolean(busy) || oauthBusy}
        onClick={onDisconnect}
        aria-label={`Ngắt kết nối ${connection.label} khỏi ${providerName}`}
        className="min-h-11 rounded-xl px-3 text-xs font-extrabold text-[var(--color-danger)] transition-colors hover:bg-red-50 active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isBusy && busy?.action === "disconnect" ? "Đang ngắt…" : "Ngắt kết nối"}
      </button>
    </div>
  </div>;
}

function storageReasonMessage(reason: StorageManagerOpenReason) {
  if (reason === "connection-required") {
    return "Để lưu hoạt động có ảnh, hãy kết nối Cloudinary hoặc Google Drive bên dưới.";
  }
  if (reason === "reconnect-required") {
    return "Nơi lưu hiện tại cần được kết nối lại trước khi bạn có thể lưu ảnh mới.";
  }
  return "";
}

function providerFromOAuthMessage(type: string | undefined): StorageProviderId | undefined {
  if (type === "soydiary:cloudinary-oauth") return "cloudinary";
  if (type === "soydiary:google-drive-oauth") return "google-drive";
  return undefined;
}

function friendlyOAuthError(provider: StorageProviderId, rawMessage?: string) {
  const name = providerMeta[provider].name;
  const normalized = rawMessage?.toLowerCase() ?? "";
  if (normalized.includes("access_denied")) {
    return `Bạn đã hủy cấp quyền cho ${name}. Hãy kết nối lại khi sẵn sàng.`;
  }
  if (normalized.includes("invalid_state")) {
    return `Phiên kết nối ${name} đã hết hạn. Hãy bấm Kết nối và thử lại.`;
  }
  return `Không thể kết nối ${name}. Hãy kiểm tra tài khoản rồi thử lại.`;
}

function feedbackClassName(tone: ProviderFeedback["tone"]) {
  if (tone === "error") return "bg-red-50 text-[var(--color-danger)]";
  if (tone === "success") return "bg-emerald-50 text-emerald-700";
  return "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]";
}

function CloudinaryMark() {
  return <CloudIcon className="h-7 w-7" />;
}

function GoogleDriveMark() {
  return <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
    <path d="M11.1 4h7.2l8.4 14.5h-7.2L11.1 4Z" fill="#fbbc04" />
    <path d="M11.1 4 3.6 17l3.7 6.5L18.3 4h-7.2Z" fill="#34a853" />
    <path d="M7.3 23.5h15l4.4-7.5h-15l-4.4 7.5Z" fill="#4285f4" />
  </svg>;
}
