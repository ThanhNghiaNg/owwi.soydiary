"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { localDateInputValue } from "@/lib/date";
export function OnboardingForm() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setBusy(true); setError("");
    const body = { name: String(formData.get("name") ?? ""), birthDate: String(formData.get("birthDate") ?? "") };
    const res = await fetch("/api/baby", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setBusy(false); setError("Không thể lưu thông tin. Vui lòng kiểm tra lại."); return; }
    router.replace("/app"); router.refresh();
  }
  return <form action={submit} className="mt-7 space-y-5"><label className="block"><span className="mb-2 block text-sm font-extrabold">Tên của bé</span><input name="name" required maxLength={60} autoComplete="off" className="field-control" placeholder="Ví dụ: Soy"/><span className="mt-1.5 block text-xs text-[var(--color-muted)]">Tên sẽ hiển thị trên màn hình chính.</span></label><label className="block"><span className="mb-2 block text-sm font-extrabold">Ngày sinh</span><input name="birthDate" type="date" required max={localDateInputValue()} className="field-control"/></label>{error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-[var(--color-danger)]">{error}</p> : null}<button disabled={busy} className="primary-button w-full">{busy ? "Đang lưu…" : "Bắt đầu theo dõi"}</button></form>;
}
