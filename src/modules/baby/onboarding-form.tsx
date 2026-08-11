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
  return <form action={submit} className="mt-7 space-y-5"><label className="block"><span className="mb-2 block font-bold">Tên của bé</span><input name="name" required maxLength={60} className="w-full rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#20b4b4]" placeholder="Ví dụ: Soy"/></label><label className="block"><span className="mb-2 block font-bold">Ngày sinh</span><input name="birthDate" type="date" required max={localDateInputValue()} className="w-full rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#20b4b4]"/></label>{error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}<button disabled={busy} className="w-full rounded-full bg-[#20b4b4] px-4 py-4 font-extrabold text-white disabled:opacity-50">{busy ? "Đang lưu..." : "Bắt đầu"}</button></form>;
}
