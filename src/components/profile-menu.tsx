"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { ConfirmDialog } from "./confirm-dialog";
import { CloudIcon, LogOutIcon, ProfileIcon } from "./icons";
import { StorageManager } from "@/modules/integrations/storage/storage-manager";

type ProfileMenuProps = {
  accountName: string | null | undefined;
  accountEmail: string | null | undefined;
};

export function ProfileMenu({ accountName, accountEmail }: ProfileMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const logoutOptionRef = useRef<HTMLButtonElement>(null);

  const closeLogoutDialog = useCallback(() => {
    if (signingOut) return;
    setLogoutDialogOpen(false);
    setError("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [signingOut]);

  useEffect(() => {
    if (!menuOpen) return;
    const focusFrame = window.requestAnimationFrame(() => logoutOptionRef.current?.focus());

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function openLogoutDialog() {
    setMenuOpen(false);
    setError("");
    setLogoutDialogOpen(true);
  }

  async function logout() {
    setSigningOut(true);
    setError("");
    try {
      await signOut({ redirectTo: "/login" });
    } catch {
      setSigningOut(false);
      setError("Chưa thể đăng xuất. Bạn kiểm tra kết nối rồi thử lại nhé.");
    }
  }

  const accountLabel = accountName || accountEmail || "Tài khoản Google";
  const accountDetail = accountName && accountEmail ? ` (${accountEmail})` : "";
  const description = error
    ? error
    : `${accountLabel}${accountDetail}. Các hoạt động đã lưu vẫn được giữ nguyên sau khi đăng xuất.`;

  return <div
    className="relative shrink-0"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
    }}
  >
    <button
      ref={triggerRef}
      type="button"
      aria-label="Mở tài khoản"
      aria-haspopup="menu"
      aria-controls={menuOpen ? menuId : undefined}
      aria-expanded={menuOpen}
      onClick={() => setMenuOpen((current) => !current)}
      className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-white transition-colors hover:bg-white/20 active:bg-white/25"
    >
      <ProfileIcon className="h-6 w-6" />
    </button>

    {menuOpen ? <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label="Tùy chọn tài khoản"
      className="profile-popover absolute right-0 top-[calc(100%+0.75rem)] z-[55] w-[min(18rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white p-2 text-[var(--color-ink)] shadow-[0_16px_42px_rgba(31,22,43,0.22)]"
    >
      <div role="presentation" className="flex items-center gap-3 px-3 py-2.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" aria-hidden="true">
          <ProfileIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold">{accountLabel}</span>
          {accountEmail && accountEmail !== accountLabel ? <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">{accountEmail}</span> : null}
        </span>
      </div>
      <div role="separator" className="my-1 border-t border-[var(--color-border)]" />
      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setStorageOpen(true); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-extrabold transition-colors hover:bg-[var(--color-primary-soft)]">
        <CloudIcon className="h-5 w-5 shrink-0" /> Quản lý storage
      </button>
      <button
        ref={logoutOptionRef}
        type="button"
        role="menuitem"
        onClick={openLogoutDialog}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-extrabold text-[var(--color-danger)] transition-colors hover:bg-red-50 active:bg-red-100"
      >
        <LogOutIcon className="h-5 w-5 shrink-0" />
        Đăng xuất
      </button>
    </div> : null}

    <ConfirmDialog
      open={logoutDialogOpen}
      title="Đăng xuất khỏi Baby's Diary?"
      description={description}
      confirmLabel={signingOut ? "Đang đăng xuất…" : error ? "Thử lại" : "Đăng xuất"}
      cancelLabel="Ở lại"
      confirmDisabled={signingOut}
      cancelDisabled={signingOut}
      tone="danger"
      icon={<LogOutIcon className="h-6 w-6" />}
      onConfirm={() => { void logout(); }}
      onClose={closeLogoutDialog}
    />
    <StorageManager open={storageOpen} onClose={() => setStorageOpen(false)} />
  </div>;
}
