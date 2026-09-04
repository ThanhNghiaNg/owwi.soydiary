"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { activityInputSchema, type ActivityDto, type ActivityInput, type ActivityType } from "./activity.dto";
import { getActivityMeta } from "./activity.registry";
import { ActivityAsset } from "./activity-asset";
import { CalendarIcon, ClockIcon, ChevronLeft, PauseIcon, PlayIcon, TrashIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { combineLocalDateTime, localDateInputValue, localTimeInputValue } from "@/lib/date";
import { removeActivityCaches } from "@/lib/swr";
import { ActivityMediaPicker, type PendingActivityMedia } from "./activity-media";
import { useActivitySaveQueue } from "./activity-save-queue";
import {
  describeActivitySaveFailure,
  pendingActivityMediaCount,
  withActivitySaveMedia,
  type ActivitySaveDraft,
} from "./activity-save-draft";
import { ActivityMediaSyncNotice } from "./activity-media-sync-status";
import {
  openStorageManager,
  type StorageManagerOpenReason,
} from "@/modules/integrations/storage/storage-manager";
import {
  clearBreastfeedingTimer,
  breastfeedingTimerMutationId,
  formatTimerDuration,
  getBreastfeedingElapsed,
  toggleBreastSide,
  updateBreastfeedingDraft,
  useBreastfeedingTimer,
  useTimerNow,
  type BreastfeedingTimerState,
} from "./breastfeeding-timer";

type Fields = Record<string, string | number>;
type PickOption = { value: string; label: string };

const colors: PickOption[] = [
  { value: "Yellow", label: "Vàng" }, { value: "Brown", label: "Nâu" },
  { value: "Black", label: "Đen" }, { value: "Green", label: "Xanh lá" },
  { value: "Red", label: "Đỏ" }, { value: "Orange", label: "Cam" },
  { value: "White", label: "Trắng" },
];

const consistencies: PickOption[] = [
  { value: "Sticky", label: "Dính" }, { value: "Mushy", label: "Nhão" },
  { value: "Soft", label: "Mềm" }, { value: "Well-formed", label: "Thành khuôn" },
  { value: "Watery", label: "Lỏng" }, { value: "Hard", label: "Cứng" },
  { value: "Chalky", label: "Bột" },
];

const diaperTypes: PickOption[] = [
  { value: "pee", label: "Tã ướt" }, { value: "poop", label: "Tã bẩn" },
  { value: "mixed", label: "Cả hai" }, { value: "dry", label: "Tã khô" },
];

function screenTitle(type: ActivityType) {
  if (type === "breastfeeding" || type === "bottle" || type === "pump") return "Ghi cữ ăn";
  if (type === "diaper") return "Ghi lần thay tã";
  if (type === "sleep") return "Ghi giấc ngủ";
  if (type === "moment") return "Ghi khoảnh khắc";
  return "Ghi hoạt động";
}

function initialFields(type: ActivityType, activity?: ActivityDto | ActivityInput): Fields {
  if (activity?.type === "breastfeeding") return { leftSeconds: activity.leftSeconds, rightSeconds: activity.rightSeconds };
  if (activity?.type === "bottle") return { amountMl: activity.amountMl, milkType: activity.milkType };
  if (activity?.type === "pump") return { leftMl: activity.leftMl, rightMl: activity.rightMl };
  if (activity?.type === "diaper") return { diaperType: activity.diaperType, color: activity.color ?? "", consistency: activity.consistency ?? "" };
  if (activity?.type === "sleep") {
    const endedAt = new Date(activity.endedAt);
    return { endDate: localDateInputValue(endedAt), endTime: localTimeInputValue(endedAt) };
  }
  if (activity?.type === "tummy") return { durationMinutes: activity.durationMinutes, label: activity.label };
  if (activity?.type === "solid" || activity?.type === "custom") return { label: activity.label };
  if (type === "bottle") return { amountMl: 90, milkType: "breast-milk" };
  if (type === "pump") return { leftMl: 90, rightMl: 40 };
  if (type === "diaper") return { diaperType: "poop", color: "Yellow", consistency: "Soft" };
  if (type === "tummy") return { durationMinutes: 0, label: "Nằm sấp" };
  if (type === "solid") return { label: "Ăn dặm" };
  if (type === "custom") return { label: "Hoạt động khác" };
  if (type === "sleep") return { endDate: localDateInputValue(), endTime: localTimeInputValue() };
  if (type === "moment") return {};
  return { leftSeconds: 0, rightSeconds: 0 };
}

export function ActivityEditor({ type, babyId, activity, returnHref = "/app" }: { type: ActivityType; babyId: string; activity?: ActivityDto; returnHref?: string }) {
  const router = useRouter();
  const { cache, mutate } = useSWRConfig();
  const { saveActivityWithMedia, cancelActivityMediaSync, mediaJobs, recoveryReady } = useActivitySaveQueue();
  const meta = getActivityMeta(type);
  const storedTimer = useBreastfeedingTimer();
  const editing = Boolean(activity);
  const timer = !editing && type === "breastfeeding" && storedTimer?.babyId === babyId ? storedTimer : null;
  const timerNow = useTimerNow(Boolean(timer?.activeSide));
  const breastElapsed = getBreastfeedingElapsed(timer, timerNow);
  const initialActivity = activity;
  const occurredDate = initialActivity ? new Date(initialActivity.occurredAt) : new Date();
  const [date, setDate] = useState(() => localDateInputValue(occurredDate));
  const [time, setTime] = useState(() => localTimeInputValue(occurredDate));
  const [note, setNote] = useState(initialActivity?.note ?? "");
  const [media, setMedia] = useState<PendingActivityMedia[]>(activity?.media ?? []);
  const uploadFolderKey = useRef(activity?.id ?? crypto.randomUUID());
  const clientMutationId = useRef(crypto.randomUUID());
  const jobId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [storageIssue, setStorageIssue] = useState<Exclude<StorageManagerOpenReason, "manage"> | undefined>(undefined);
  const errorRef = useRef<HTMLDivElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fields, setFields] = useState<Fields>(() => initialFields(type, initialActivity));

  const timerDate = timer ? new Date(timer.occurredAt) : null;
  const displayedDate = timerDate ? localDateInputValue(timerDate) : date;
  const displayedTime = timerDate ? localTimeInputValue(timerDate) : time;
  const displayedNote = timer ? timer.note : note;
  const localMediaJob = activity ? mediaJobs[activity.id] : undefined;
  const serverMediaSyncStatus = activity?.mediaSyncStatus ?? "synced";
  const missingLocalMediaJob = Boolean(activity && recoveryReady && !localMediaJob && (
    serverMediaSyncStatus === "pending" || serverMediaSyncStatus === "uploading"
  ));
  const mediaSyncStatus = missingLocalMediaJob ? "failed" : localMediaJob?.status ?? serverMediaSyncStatus;
  const mediaSyncLocked = Boolean(activity && (
    mediaSyncStatus === "pending"
    || mediaSyncStatus === "uploading"
    || (mediaSyncStatus === "failed" && localMediaJob)
  ));
  const totalBreast = editing ? Number(fields.leftSeconds) + Number(fields.rightSeconds) : breastElapsed.totalSeconds;
  const payload = useMemo<ActivityInput | null>(() => {
    const base = {
      type,
      occurredAt: timer?.occurredAt ?? combineLocalDateTime(date, time),
      note: timer?.note ?? note,
      media: media.map(({ file: _file, ...item }) => item),
    } as const;
    switch (type) {
      case "breastfeeding": return { ...base, type, leftSeconds: editing ? Number(fields.leftSeconds) : breastElapsed.leftSeconds, rightSeconds: editing ? Number(fields.rightSeconds) : breastElapsed.rightSeconds };
      case "bottle": return { ...base, type, milkType: String(fields.milkType) as "breast-milk" | "formula" | "other", amountMl: Number(fields.amountMl) };
      case "pump": return { ...base, type, leftMl: Number(fields.leftMl), rightMl: Number(fields.rightMl) };
      case "diaper": return { ...base, type, diaperType: String(fields.diaperType) as "pee" | "poop" | "mixed" | "dry", color: String(fields.color || ""), consistency: String(fields.consistency || "") };
      case "sleep": return { ...base, type, endedAt: combineLocalDateTime(String(fields.endDate), String(fields.endTime)) };
      case "tummy": return { ...base, type, durationMinutes: Number(fields.durationMinutes), label: String(fields.label) };
      case "solid": return { ...base, type, label: String(fields.label) };
      case "moment": return { ...base, type };
      case "custom": return { ...base, type, label: String(fields.label) };
    }
  }, [breastElapsed.leftSeconds, breastElapsed.rightSeconds, date, editing, fields, media, note, time, timer?.note, timer?.occurredAt, type]);

  const field = useCallback((name: string, value: string | number) => {
    setFields((previous) => ({ ...previous, [name]: value }));
  }, []);

  useEffect(() => {
    if (!error) return;
    const frame = window.requestAnimationFrame(() => {
      const alert = errorRef.current;
      if (!alert) return;
      alert.focus({ preventScroll: true });
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      alert.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error]);

  async function save() {
    if (!payload || saving) return;
    setError("");
    setStorageIssue(undefined);
    if (type === "moment" && !payload.note.trim() && media.length === 0) {
      setError("Hãy thêm mô tả hoặc ít nhất một ảnh/video cho khoảnh khắc này.");
      return;
    }
    const validationInput = activity && mediaSyncStatus !== "synced"
      ? {
          ...payload,
          mediaSyncStatus,
          mediaSyncExpectedCount: activity.mediaSyncExpectedCount ?? media.length,
        }
      : payload;
    const candidate = withActivitySaveMedia(validationInput, media);
    const validated = activityInputSchema.safeParse(candidate);
    if (!validated.success) {
      setError("Thông tin hoạt động chưa hợp lệ. Bạn kiểm tra lại các trường rồi lưu nhé.");
      return;
    }
    if (validated.data.type === "sleep" && new Date(validated.data.endedAt) < new Date(validated.data.occurredAt)) {
      setError("Thời điểm thức dậy phải sau thời điểm bắt đầu ngủ.");
      return;
    }

    const elapsed = getBreastfeedingElapsed(timer, Date.now());
    const input = type === "breastfeeding" && timer
      ? { ...payload, leftSeconds: elapsed.leftSeconds, rightSeconds: elapsed.rightSeconds }
      : payload;
    const draft: ActivitySaveDraft = {
      version: 3,
      id: jobId.current,
      babyId,
      type,
      ...(activity ? { activityId: activity.id } : {}),
      input: withActivitySaveMedia(input, media),
      media,
      uploadFolderKey: uploadFolderKey.current,
      clientMutationId: type === "breastfeeding" && timer ? breastfeedingTimerMutationId(timer) : clientMutationId.current,
      submittedAt: Date.now(),
      preserveMediaSync: Boolean(activity && mediaSyncStatus !== "synced" && pendingActivityMediaCount(media) === 0),
    };
    setSaving(true);
    try {
      await saveActivityWithMedia(draft);
      if (type === "breastfeeding" && timer) clearBreastfeedingTimer();
      if ("vibrate" in navigator) navigator.vibrate(10);
      router.replace(returnHref);
    } catch (caught) {
      const failure = describeActivitySaveFailure(caught);
      setError(failure.message);
      setStorageIssue(failure.storageIssue);
      setSaving(false);
    }
  }

  async function remove() {
    if (!activity || deleting) return;
    setDeleting(true);
    setError("");
    setStorageIssue(undefined);
    try {
      const response = await fetch(`/api/activities/${activity.id}`, { method: "DELETE" });
      if (!response.ok) {
        setDeleteOpen(false);
        setError("Chưa thể xóa hoạt động. Bạn thử lại sau nhé.");
        return;
      }
      cancelActivityMediaSync(activity.id);
      await removeActivityCaches(cache, mutate, activity.id);
      if ("vibrate" in navigator) navigator.vibrate(10);
      router.replace(returnHref);
      router.refresh();
    } catch {
      setDeleteOpen(false);
      setError("Mất kết nối. Hoạt động chưa bị xóa, bạn thử lại nhé.");
    } finally {
      setDeleting(false);
    }
  }

  function changeDate(nextDate: string) {
    setDate(nextDate);
    if (timer) updateBreastfeedingDraft({ occurredAt: combineLocalDateTime(nextDate, displayedTime) });
  }

  function changeTime(nextTime: string) {
    setTime(nextTime);
    if (timer) updateBreastfeedingDraft({ occurredAt: combineLocalDateTime(displayedDate, nextTime) });
  }

  function changeNote(nextNote: string) {
    setNote(nextNote);
    if (timer) updateBreastfeedingDraft({ note: nextNote });
  }

  return <div className="app-page min-w-0 max-w-full overflow-x-clip pb-4">
    <header className="rounded-b-[2rem] bg-[var(--color-primary)] px-3 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <div className="flex items-center">
        <button onClick={() => editing ? router.push(returnHref) : router.back()} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors hover:bg-white/15 active:bg-white/20" aria-label="Quay lại">
          <ChevronLeft className="h-7 w-7" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs font-bold text-white/70">{editing ? "Chi tiết hoạt động" : screenTitle(type)}</p>
          <h1 className="truncate text-xl font-extrabold tracking-tight">{meta.label}</h1>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15" aria-hidden="true">
          <ActivityAsset type={type} size={42} className="h-10 w-10" />
        </div>
      </div>
    </header>

    {!editing && (type === "breastfeeding" || type === "bottle" || type === "pump") ? <nav aria-label="Loại cữ ăn" className="mx-4 mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-[var(--color-border)] bg-white p-1 sm:mx-6">
      {([
        ["breastfeeding", "Bú mẹ"], ["bottle", "Bú bình"], ["pump", "Hút sữa"],
      ] as const).map(([tabType, label]) => <button key={tabType} onClick={() => router.replace(`/app/track/${tabType}${returnHref === "/app/history" ? "?from=history" : ""}`)} aria-current={type === tabType ? "page" : undefined} className={`min-h-11 rounded-xl px-2 text-sm font-extrabold transition-colors ${type === tabType ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" : "text-[var(--color-muted)] hover:bg-zinc-50"}`}>{label}</button>)}
    </nav> : null}

    <main className="min-w-0 max-w-full space-y-4 overflow-x-hidden px-4 py-5 sm:px-6">
      {editing ? <p className="rounded-2xl bg-[var(--color-primary-soft)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--color-primary-strong)]">Chạm vào từng trường bên dưới để sửa. Loại hoạt động được giữ nguyên để dữ liệu thống kê luôn chính xác.</p> : null}
      <section className="surface-card p-4" aria-labelledby="time-title">
        <h2 id="time-title" className="mb-3 text-sm font-extrabold text-[var(--color-muted)]">Thời điểm</h2>
        <div className="space-y-3">
          <DateTimeRow icon={<CalendarIcon className="h-5 w-5" />} label="Ngày">
            <input aria-label="Ngày diễn ra" value={displayedDate} onChange={(event) => changeDate(event.target.value)} type="date" className="min-h-11 min-w-0 w-[46vw] max-w-[180px] rounded-xl bg-[#f4f1f7] px-3 py-2 text-right text-base font-bold outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </DateTimeRow>
          <DateTimeRow icon={<ClockIcon className="h-5 w-5" />} label="Giờ">
            <input aria-label="Giờ diễn ra" value={displayedTime} onChange={(event) => changeTime(event.target.value)} type="time" className="min-h-11 min-w-0 w-[42vw] max-w-[140px] rounded-xl bg-[#f4f1f7] px-3 py-2 text-right text-base font-bold outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </DateTimeRow>
        </div>
      </section>

      {type !== "moment" ? <section className="surface-card min-w-0 max-w-full overflow-hidden p-5">
        {type === "breastfeeding" ? editing
          ? <BreastEditFields fields={fields} setField={field} />
          : <BreastFields timer={timer} now={timerNow} draft={{ babyId, occurredAt: timer?.occurredAt ?? combineLocalDateTime(date, time), note: displayedNote }} />
        : null}
        {type === "bottle" ? <BottleFields fields={fields} setField={field} /> : null}
        {type === "pump" ? <PumpFields fields={fields} setField={field} /> : null}
        {type === "diaper" ? <DiaperFields fields={fields} setField={field} /> : null}
        {type === "sleep" ? <SleepFields fields={fields} setField={field} /> : null}
        {type === "tummy" ? <TummyFields fields={fields} setField={field} /> : null}
        {type === "solid" || type === "custom" ? <LabelField fields={fields} setField={field} placeholder={meta.label} /> : null}
      </section> : null}

      <label className="surface-card block p-5">
        <span className="mb-2 block text-sm font-extrabold">
          {type === "moment" ? "Mô tả" : "Ghi chú"}{" "}
          <span className="font-medium text-[var(--color-muted)]">{type === "moment" ? "(hoặc thêm ảnh/video)" : "(không bắt buộc)"}</span>
        </span>
        <textarea
          value={displayedNote}
          onChange={(event) => changeNote(event.target.value)}
          className="field-control h-24 resize-none"
          placeholder={type === "moment" ? "Điều đáng nhớ về khoảnh khắc này…" : "Ví dụ: Bé ăn ngon, ngủ sâu…"}
        />
      </label>

      {activity ? <ActivityMediaSyncNotice activity={activity} /> : null}
      <ActivityMediaPicker media={media} disabled={saving || mediaSyncLocked} onChange={setMedia} />

      {error ? <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">
        <p className="leading-6">{error}</p>
        {storageIssue ? <button
          type="button"
          onClick={(event) => openStorageManager({ reason: storageIssue, returnFocus: event.currentTarget })}
          className="mt-3 min-h-12 w-full rounded-xl bg-[var(--color-primary)] px-4 font-extrabold text-white transition-colors hover:bg-[var(--color-primary-strong)] active:bg-[#452b8a]"
        >
          {storageIssue === "reconnect-required" ? "Mở và kết nối lại" : "Mở nơi lưu media"}
        </button> : null}
      </div> : null}
      {editing ? <button type="button" onClick={() => setDeleteOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 text-sm font-extrabold text-[var(--color-danger)] transition-colors hover:bg-red-50 active:bg-red-100">
        <TrashIcon className="h-5 w-5" /> Xóa hoạt động
      </button> : null}
    </main>

    <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[620px] border-t border-[var(--color-border)] bg-white/95 px-4 pt-3 backdrop-blur-xl sm:px-6">
      <button onClick={() => { void save(); }} disabled={saving || (type === "breastfeeding" && totalBreast === 0)} className="primary-button w-full">
        {saving ? "Đang lưu hoạt động…" : editing ? "Lưu thay đổi" : "Lưu hoạt động"}
      </button>
    </div>
    <ConfirmDialog
      open={deleteOpen}
      title="Xóa hoạt động này?"
      description={`${meta.label} sẽ bị xóa khỏi lịch sử và các số liệu thống kê. Thao tác này không thể hoàn tác.`}
      confirmLabel={deleting ? "Đang xóa…" : "Xóa hoạt động"}
      confirmDisabled={deleting}
      cancelDisabled={deleting}
      cancelLabel="Giữ lại"
      tone="danger"
      onConfirm={() => { void remove(); }}
      onClose={() => { if (!deleting) setDeleteOpen(false); }}
    />
  </div>;
}

function DateTimeRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return <div className="flex min-h-12 items-center gap-3">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">{icon}</span>
    <b className="text-sm">{label}</b>
    <div className="ml-auto min-w-0">{children}</div>
  </div>;
}

function BreastFields({ timer, now, draft }: { timer: BreastfeedingTimerState | null; now: number; draft: { babyId: string; occurredAt: string; note: string } }) {
  const elapsed = getBreastfeedingElapsed(timer, now);
  return <div>
    <p className="text-center text-sm font-bold text-[var(--color-muted)]">Tổng thời gian</p>
    <div className="mt-1 text-center text-4xl font-black tracking-tight tabular-nums">{formatTimerDuration(elapsed.totalSeconds)}</div>
    <div className="mt-6 grid grid-cols-2 gap-4">
      <TimerButton label="Bên trái" seconds={elapsed.leftSeconds} active={timer?.activeSide === "left"} onClick={() => toggleBreastSide("left", draft)} />
      <TimerButton label="Bên phải" seconds={elapsed.rightSeconds} active={timer?.activeSide === "right"} onClick={() => toggleBreastSide("right", draft)} />
    </div>
    {!timer ? <p className="mt-5 text-center text-xs text-[var(--color-muted)]">Bấm bắt đầu một bên để tính giờ. Thanh theo dõi sẽ luôn hiển thị phía dưới.</p> : <p className="mt-5 text-center text-xs text-[var(--color-muted)]">Bạn có thể chuyển màn hình hoặc đưa app xuống nền mà không mất thời gian đã ghi.</p>}
  </div>;
}

function BreastEditFields({ fields, setField }: { fields: Fields; setField: (name: string, value: number) => void }) {
  const leftSeconds = Number(fields.leftSeconds);
  const rightSeconds = Number(fields.rightSeconds);
  return <div>
    <p className="text-center text-sm font-bold text-[var(--color-muted)]">Tổng thời gian bú</p>
    <div className="mt-1 text-center text-4xl font-black tracking-tight tabular-nums">{formatTimerDuration(leftSeconds + rightSeconds)}</div>
    <p className="mt-2 text-center text-xs leading-5 text-[var(--color-muted)]">Chạm vào phút hoặc giây để sửa chính xác thời lượng mỗi bên.</p>
    <div className="mt-6 grid grid-cols-2 gap-3">
      <DurationControl label="Bên trái" seconds={leftSeconds} onChange={(value) => setField("leftSeconds", value)} />
      <DurationControl label="Bên phải" seconds={rightSeconds} onChange={(value) => setField("rightSeconds", value)} />
    </div>
  </div>;
}

function DurationControl({ label, seconds, onChange }: { label: string; seconds: number; onChange: (value: number) => void }) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return <fieldset className="rounded-2xl bg-[#f7f4fa] p-3">
    <legend className="px-1 text-sm font-extrabold">{label}</legend>
    <div className="mt-1 grid grid-cols-2 gap-2">
      <label className="min-w-0 text-center text-xs font-bold text-[var(--color-muted)]">Phút
        <input aria-label={`Số phút ${label.toLowerCase()}`} type="number" inputMode="numeric" min="0" max="600" value={minutes} onChange={(event) => onChange(Math.max(0, Number(event.target.value)) * 60 + remainingSeconds)} className="field-control mt-1 min-w-0 px-2 text-center text-lg font-black tabular-nums" />
      </label>
      <label className="min-w-0 text-center text-xs font-bold text-[var(--color-muted)]">Giây
        <input aria-label={`Số giây ${label.toLowerCase()}`} type="number" inputMode="numeric" min="0" max="59" value={remainingSeconds} onChange={(event) => onChange(minutes * 60 + Math.min(59, Math.max(0, Number(event.target.value))))} className="field-control mt-1 min-w-0 px-2 text-center text-lg font-black tabular-nums" />
      </label>
    </div>
  </fieldset>;
}

function TimerButton({ label, seconds, active, onClick }: { label: string; seconds: number; active: boolean; onClick: () => void }) {
  return <div className="rounded-2xl bg-[#f7f4fa] p-3 text-center">
    <div className="mb-3 text-lg font-black tabular-nums">{formatTimerDuration(seconds)}</div>
    <button onClick={onClick} aria-label={`${active ? "Tạm dừng" : "Bắt đầu"} ${label.toLowerCase()}`} className={`mx-auto grid h-20 w-20 place-items-center rounded-full border-[6px] transition duration-200 active:scale-[.97] ${active ? "border-[#cfc2ef] bg-[var(--color-primary)] text-white" : "border-[#e0d8eb] bg-white text-[var(--color-primary-strong)]"}`}>
      {active ? <PauseIcon className="h-7 w-7" /> : <PlayIcon className="ml-0.5 h-7 w-7" />}
    </button>
    <div className="mt-3 text-sm font-extrabold">{label}</div>
  </div>;
}

function BottleFields({ fields, setField }: { fields: Fields; setField: (name: string, value: string | number) => void }) {
  return <div>
    <label className="block text-sm font-extrabold" htmlFor="milk-type">Loại sữa</label>
    <select id="milk-type" value={String(fields.milkType)} onChange={(event) => setField("milkType", event.target.value)} className="field-control mt-2">
      <option value="breast-milk">Sữa mẹ</option><option value="formula">Sữa công thức</option><option value="other">Loại khác</option>
    </select>
    <label className="mx-auto mt-6 block max-w-44 text-center text-sm font-extrabold" htmlFor="bottle-amount-number">Lượng sữa (ml)
      <input id="bottle-amount-number" type="number" inputMode="numeric" min="0" max="600" value={Number(fields.amountMl)} onChange={(event) => setField("amountMl", Number(event.target.value))} className="field-control mt-2 text-center text-2xl font-black text-[var(--color-accent)]" />
    </label>
    <label className="sr-only" htmlFor="bottle-amount">Điều chỉnh lượng sữa</label>
    <input id="bottle-amount" type="range" min="0" max="600" step="5" value={Number(fields.amountMl)} onChange={(event) => setField("amountMl", Number(event.target.value))} className="mt-4 h-12 w-full accent-[var(--color-accent)]" />
    <div className="flex justify-between text-xs font-bold text-[var(--color-muted)]"><span>0 ml</span><span>300 ml</span><span>600 ml</span></div>
  </div>;
}

function PumpFields({ fields, setField }: { fields: Fields; setField: (name: string, value: number) => void }) {
  const total = Number(fields.leftMl) + Number(fields.rightMl);
  return <div>
    <p className="text-center text-sm font-bold text-[var(--color-muted)]">Tổng lượng sữa</p>
    <div className="mt-1 text-center text-4xl font-black">{total} <small className="text-base font-bold text-[var(--color-muted)]">ml</small></div>
    <div className="mt-6 grid grid-cols-2 gap-4">
      <AmountSlider label="Bên trái" value={Number(fields.leftMl)} onChange={(value) => setField("leftMl", value)} />
      <AmountSlider label="Bên phải" value={Number(fields.rightMl)} onChange={(value) => setField("rightMl", value)} />
    </div>
  </div>;
}

function AmountSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <fieldset className="rounded-2xl bg-[#f7f4fa] p-3 text-center">
    <legend className="px-1 text-sm font-extrabold">{label}</legend>
    <input aria-label={`Lượng sữa ${label.toLowerCase()} theo ml`} type="number" inputMode="numeric" min="0" max="600" value={value} onChange={(event) => onChange(Number(event.target.value))} className="field-control mt-1 px-2 text-center text-xl font-black text-[var(--color-accent)]" />
    <input aria-label={`Điều chỉnh lượng sữa ${label.toLowerCase()}`} className="mt-3 h-11 w-full accent-[var(--color-accent)]" type="range" min="0" max="600" step="5" value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </fieldset>;
}

function DiaperFields({ fields, setField }: { fields: Fields; setField: (name: string, value: string) => void }) {
  const type = String(fields.diaperType);
  return <div>
    <h2 className="text-sm font-extrabold">Tình trạng tã</h2>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {diaperTypes.map((option) => <button key={option.value} onClick={() => setField("diaperType", option.value)} className={`min-h-12 rounded-xl border px-3 text-sm font-extrabold transition-colors ${type === option.value ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" : "border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-zinc-50"}`}>{option.label}</button>)}
    </div>
    {type === "poop" || type === "mixed" ? <>
      <OptionRow title="Màu sắc" options={colors} selected={String(fields.color)} onPick={(value) => setField("color", value)} />
      <OptionRow title="Kết cấu" options={consistencies} selected={String(fields.consistency)} onPick={(value) => setField("consistency", value)} />
    </> : null}
  </div>;
}

function OptionRow({ title, options, selected, onPick }: { title: string; options: PickOption[]; selected: string; onPick: (value: string) => void }) {
  return <fieldset className="mt-6 min-w-0 max-w-full">
    <legend className="mb-3 text-sm font-extrabold">{title}</legend>
    <div className="no-scrollbar flex w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 pr-1">
      {options.map((option) => <button key={option.value} onClick={() => onPick(option.value)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold transition-colors ${selected === option.value ? "bg-[var(--color-accent)] text-white" : "bg-[#f2eff5] text-[var(--color-muted)] hover:bg-[#e9e4ed]"}`}>{option.label}</button>)}
    </div>
  </fieldset>;
}

function SleepFields({ fields, setField }: { fields: Fields; setField: (name: string, value: string) => void }) {
  return <div>
    <h2 className="text-sm font-extrabold">Thời điểm bé thức dậy</h2>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label><span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Ngày</span><input aria-label="Ngày thức dậy" type="date" value={String(fields.endDate)} onChange={(event) => setField("endDate", event.target.value)} className="field-control" /></label>
      <label><span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Giờ</span><input aria-label="Giờ thức dậy" type="time" value={String(fields.endTime)} onChange={(event) => setField("endTime", event.target.value)} className="field-control" /></label>
    </div>
    <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">Thời điểm bắt đầu giấc ngủ được lấy ở phần “Thời điểm” phía trên.</p>
  </div>;
}

function TummyFields({ fields, setField }: { fields: Fields; setField: (name: string, value: string | number) => void }) {
  return <div>
    <label className="block"><span className="mb-2 block text-sm font-extrabold">Tổng thời gian (phút)</span><input type="number" inputMode="numeric" min="0" max="600" value={Number(fields.durationMinutes)} onChange={(event) => setField("durationMinutes", Number(event.target.value))} className="field-control text-lg font-bold" /></label>
    <LabelField fields={fields} setField={setField} placeholder="Nằm sấp" />
  </div>;
}

function LabelField({ fields, setField, placeholder }: { fields: Fields; setField: (name: string, value: string) => void; placeholder: string }) {
  return <label className="mt-6 block first:mt-0">
    <span className="mb-2 block text-sm font-extrabold">Tên hiển thị trên nhật ký</span>
    <input value={String(fields.label ?? placeholder)} onChange={(event) => setField("label", event.target.value)} className="field-control font-bold" placeholder={placeholder} />
  </label>;
}
