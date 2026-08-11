"use client";

import { useEffect, useRef, useState } from "react";
import { ChartIcon, CheckIcon, ClockIcon, SparkIcon } from "@/components/icons";
import type { AnalysisResponse } from "./analysis.dto";

const analysisAreas = [
  { title: "Nhịp sinh hoạt", description: "Khoảng cách giữa các cữ ăn, giấc ngủ và lần thay tã.", Icon: ClockIcon },
  { title: "Xu hướng 14 ngày", description: "Sự thay đổi của lượng sữa, thời gian bú, ngủ và các hoạt động.", Icon: ChartIcon },
  { title: "Điểm đáng chú ý", description: "Những khác biệt so với chính nhịp ghi chép gần đây của bé.", Icon: SparkIcon },
] as const;

export function AnalysisScreen() {
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function analyze() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeZone }),
        signal: controller.signal,
      });
      const payload = await response.json() as AnalysisResponse | { error?: string };
      if (!response.ok || !("analysis" in payload)) {
        setError("error" in payload && payload.error ? payload.error : "Chưa thể tạo phân tích. Vui lòng thử lại.");
        return;
      }
      setResult(payload);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") {
        setError("Yêu cầu phân tích đã hết thời gian. Vui lòng thử lại.");
      } else {
        setError("Mất kết nối khi phân tích. Bạn kiểm tra mạng rồi thử lại nhé.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  }

  return <main className="space-y-5 p-5 sm:p-6">
    {!result ? <>
      <section className="surface-card px-6 py-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
          <SparkIcon className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Biến nhật ký thành thông tin dễ hiểu</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--color-muted)]">Soy sẽ phân tích số liệu tổng hợp trong 14 ngày gần nhất để tìm nhịp sinh hoạt và các thay đổi đáng chú ý.</p>
        <button onClick={analyze} disabled={loading} className="primary-button mt-6 w-full max-w-sm">
          <SparkIcon className="h-5 w-5" />
          {loading ? "Đang phân tích…" : "Phân tích nhật ký"}
        </button>
        <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-[var(--color-muted)]">Tên bé, ngày sinh và nội dung ghi chú không được gửi đến model.</p>
      </section>

      {loading ? <AnalysisSkeleton /> : <section aria-labelledby="analysis-plan-title">
        <h2 id="analysis-plan-title" className="mb-3 text-lg font-extrabold tracking-tight">Nội dung phân tích</h2>
        <div className="space-y-3">
          {analysisAreas.map(({ title, description, Icon }) => <article key={title} className="surface-card flex gap-4 p-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" aria-hidden="true"><Icon className="h-6 w-6" /></div>
            <div><h3 className="font-extrabold">{title}</h3><p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">{description}</p></div>
          </article>)}
        </div>
      </section>}
    </> : <AnalysisResultView result={result} onRefresh={analyze} loading={loading} />}

    {error ? <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</div> : null}
    <p className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-xs leading-5 text-[var(--color-muted)]">Phân tích chỉ hỗ trợ bố mẹ đọc nhật ký thuận tiện hơn, không thay thế tư vấn hoặc chẩn đoán từ bác sĩ.</p>
  </main>;
}

function AnalysisResultView({ result, onRefresh, loading }: { result: AnalysisResponse; onRefresh: () => void; loading: boolean }) {
  const generatedAt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(result.generatedAt));
  return <div className="space-y-5">
    <section className="surface-card p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><SparkIcon className="h-6 w-6" /></div>
        <div><p className="text-xs font-bold text-[var(--color-muted)]">Phân tích {result.activityCount} hoạt động</p><h1 className="text-xl font-black tracking-tight">Tổng quan</h1></div>
      </div>
      <p className="mt-4 whitespace-pre-line text-sm leading-6 text-[var(--color-ink)]">{result.analysis.summary}</p>
    </section>

    {result.analysis.highlights.length ? <ResultSection title="Điểm nổi bật" items={result.analysis.highlights} icon="spark" /> : null}
    {result.analysis.patterns.length ? <ResultSection title="Nhịp được ghi nhận" items={result.analysis.patterns} icon="chart" /> : null}

    {result.analysis.nextSteps.length ? <section className="surface-card p-5">
      <h2 className="text-lg font-extrabold tracking-tight">Nên tiếp tục quan sát</h2>
      <ul className="mt-4 space-y-3">
        {result.analysis.nextSteps.map((step, index) => <li key={`${step}-${index}`} className="flex gap-3 text-sm leading-6"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><CheckIcon className="h-4 w-4" /></span><span>{step}</span></li>)}
      </ul>
    </section> : null}

    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-[var(--color-muted)]">Cập nhật lúc {generatedAt}{result.cached ? " · bản đã lưu tạm" : ""}</p>
      <button onClick={onRefresh} disabled={loading} className="min-h-12 shrink-0 rounded-xl bg-[var(--color-primary-soft)] px-4 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[#e1d7f6] disabled:opacity-50">{loading ? "Đang cập nhật…" : "Phân tích lại"}</button>
    </div>
  </div>;
}

function ResultSection({ title, items, icon }: { title: string; items: Array<{ title: string; detail: string }>; icon: "spark" | "chart" }) {
  const Icon = icon === "spark" ? SparkIcon : ChartIcon;
  return <section aria-label={title}>
    <h2 className="mb-3 text-lg font-extrabold tracking-tight">{title}</h2>
    <div className="space-y-3">{items.map((item, index) => <article key={`${item.title}-${index}`} className="surface-card flex gap-4 p-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" aria-hidden="true"><Icon className="h-5 w-5" /></div>
      <div><h3 className="font-extrabold">{item.title}</h3><p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">{item.detail}</p></div>
    </article>)}</div>
  </section>;
}

function AnalysisSkeleton() {
  return <div aria-label="Đang tạo phân tích" aria-busy="true" className="space-y-3">
    {[0, 1, 2].map((item) => <div key={item} className="surface-card animate-pulse p-5"><div className="h-4 w-32 rounded bg-[#e9e4ed]" /><div className="mt-3 h-3 w-full rounded bg-[#f0ecf3]" /><div className="mt-2 h-3 w-4/5 rounded bg-[#f0ecf3]" /></div>)}
  </div>;
}
