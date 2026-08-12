"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ChartIcon, CheckIcon, ClockIcon, SparkIcon } from "@/components/icons";
import { ANALYSIS_KEY, broadcastDataChange } from "@/lib/swr";
import type { AnalysisResponse, AnalysisWindow } from "./analysis.dto";

const analysisWindows: Array<{ days: AnalysisWindow; label: string }> = [
  { days: 7, label: "1 tuần" },
  { days: 14, label: "2 tuần" },
  { days: 30, label: "30 ngày" },
  { days: 90, label: "90 ngày" },
];

function windowLabel(days: AnalysisWindow) {
  return analysisWindows.find((item) => item.days === days)?.label ?? `${days} ngày`;
}

export function AnalysisScreen() {
  const [days, setDays] = useState<AnalysisWindow>(14);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const analysisControllerRef = useRef<AbortController | null>(null);
  const analysisKey = `${ANALYSIS_KEY}?days=${days}`;
  const { data: saved, error: savedError, isLoading: loadingSaved, mutate } = useSWR<{ result: AnalysisResponse | null }>(analysisKey);
  const result = saved?.result ?? null;

  useEffect(() => () => analysisControllerRef.current?.abort(), []);

  function selectWindow(nextDays: AnalysisWindow) {
    if (nextDays === days || analyzing) return;
    setDays(nextDays);
    setError("");
  }

  async function analyze() {
    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    setAnalyzing(true);
    setError("");
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeZone, days }),
        signal: controller.signal,
      });
      const payload = await response.json() as AnalysisResponse | { error?: string };
      if (!response.ok || !("analysis" in payload)) {
        setError("error" in payload && payload.error ? payload.error : "Chưa thể tạo phân tích. Vui lòng thử lại.");
        return;
      }
      await mutate({ result: payload }, { revalidate: false });
      broadcastDataChange("analysis");
      void mutate();
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") {
        setError("Yêu cầu phân tích đã hết thời gian. Vui lòng thử lại.");
      } else {
        setError("Mất kết nối khi phân tích. Bạn kiểm tra mạng rồi thử lại nhé.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (analysisControllerRef.current === controller) analysisControllerRef.current = null;
      setAnalyzing(false);
    }
  }

  const selectedLabel = windowLabel(days);
  const analysisAreas = [
    { title: "Nhịp sinh hoạt", description: "Khoảng cách giữa các cữ ăn, giấc ngủ và lần thay tã.", Icon: ClockIcon },
    { title: `Xu hướng ${selectedLabel}`, description: "Sự thay đổi của lượng sữa, thời gian bú, ngủ và các hoạt động.", Icon: ChartIcon },
    { title: "Ghi chú và điểm đáng chú ý", description: "Kết hợp số liệu với nội dung bố mẹ đã ghi lại trong từng hoạt động.", Icon: SparkIcon },
  ] as const;

  return <main className="space-y-5 p-5 sm:p-6">
    <fieldset className="surface-card p-4">
      <legend className="px-2 text-sm font-extrabold text-[var(--color-muted)]">Khoảng thời gian phân tích</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {analysisWindows.map((item) => <button
          key={item.days}
          type="button"
          disabled={analyzing}
          aria-pressed={days === item.days}
          onClick={() => selectWindow(item.days)}
          className={`min-h-12 rounded-xl px-3 text-sm font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${days === item.days ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] hover:bg-[#e1d7f6]"}`}
        >{item.label}</button>)}
      </div>
    </fieldset>

    {loadingSaved ? <AnalysisSkeleton label="Đang tải phân tích đã lưu" /> : !result ? <>
      <section className="surface-card px-6 py-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
          <SparkIcon className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Biến nhật ký thành thông tin dễ hiểu</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--color-muted)]">Phân tích hoạt động và nội dung ghi chú trong {selectedLabel} gần nhất để tìm nhịp sinh hoạt và những thay đổi đáng chú ý.</p>
        <button onClick={analyze} disabled={analyzing} className="primary-button mt-6 w-full max-w-sm">
          <SparkIcon className="h-5 w-5" />
          {analyzing ? "Đang phân tích…" : "Phân tích nhật ký"}
        </button>
      </section>

      {analyzing ? <AnalysisSkeleton label="Đang tạo phân tích mới" /> : <section aria-labelledby="analysis-plan-title">
        <h2 id="analysis-plan-title" className="mb-3 text-lg font-extrabold tracking-tight">Nội dung phân tích</h2>
        <div className="space-y-3">
          {analysisAreas.map(({ title, description, Icon }) => <article key={title} className="surface-card flex gap-4 p-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" aria-hidden="true"><Icon className="h-6 w-6" /></div>
            <div><h3 className="font-extrabold">{title}</h3><p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">{description}</p></div>
          </article>)}
        </div>
      </section>}
    </> : <AnalysisResultView result={result} onRefresh={analyze} loading={analyzing} />}

    {error || savedError ? <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error || "Chưa thể tải kết quả phân tích đã lưu. Bạn thử lại sau nhé."}</div> : null}
    <p className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-xs leading-5 text-[var(--color-muted)]">Phân tích chỉ hỗ trợ bố mẹ đọc nhật ký thuận tiện hơn, không thay thế tư vấn hoặc chẩn đoán từ bác sĩ.</p>
  </main>;
}

function AnalysisResultView({ result, onRefresh, loading }: { result: AnalysisResponse; onRefresh: () => void; loading: boolean }) {
  const generatedAt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(result.generatedAt));
  return <div className="space-y-5">
    <section className="surface-card p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><SparkIcon className="h-6 w-6" /></div>
        <div><p className="text-xs font-bold text-[var(--color-muted)]">{windowLabel(result.windowDays)} · {result.activityCount} hoạt động</p><h1 className="text-xl font-black tracking-tight">Tổng quan</h1></div>
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
      <p className="text-xs leading-5 text-[var(--color-muted)]">Đã lưu lúc {generatedAt}</p>
      <button onClick={onRefresh} disabled={loading} className="min-h-12 shrink-0 rounded-xl bg-[var(--color-primary-soft)] px-4 text-sm font-extrabold text-[var(--color-primary-strong)] transition-colors hover:bg-[#e1d7f6] disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Đang phân tích…" : "Phân tích tiếp"}</button>
    </div>
    {loading ? <AnalysisSkeleton label="Đang cập nhật phân tích" /> : null}
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

function AnalysisSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} aria-busy="true" className="space-y-3">
    {[0, 1, 2].map((item) => <div key={item} className="surface-card animate-pulse p-5"><div className="h-4 w-32 rounded bg-[#e9e4ed]" /><div className="mt-3 h-3 w-full rounded bg-[#f0ecf3]" /><div className="mt-2 h-3 w-4/5 rounded bg-[#f0ecf3]" /></div>)}
  </div>;
}
