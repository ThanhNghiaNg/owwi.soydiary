import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { listActivities } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";
import {
  analysisRequestSchema,
  analysisResultSchema,
  analysisWindowSchema,
  type AnalysisResponse,
  type AnalysisResult,
} from "@/modules/analysis/analysis.dto";
import { buildAnalysisDigest } from "@/modules/analysis/analysis";
import { getSavedAnalysis, saveAnalysis } from "@/modules/analysis/analysis.repository";

export const runtime = "nodejs";

declare global {
  var __babytrackAnalysisRateLimit: Map<string, number> | undefined;
}

const analysisRateLimit = global.__babytrackAnalysisRateLimit ?? new Map<string, number>();
global.__babytrackAnalysisRateLimit = analysisRateLimit;

const ROUTER_REQUEST_TIMEOUT_MS = 45_000;

type RouterProvider = "9router" | "OpenRouter";

type RouterConfig = {
  provider: RouterProvider;
  url: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  headers?: Record<string, string>;
};

type RouterFailure = {
  provider: RouterProvider;
  kind: "timeout" | "network" | "http" | "invalid-json" | "empty-content";
  status?: number;
  retryAfter?: string;
};

type RouterResult =
  | { ok: true; content: string; model: string }
  | { ok: false; failure: RouterFailure };

function extractAnalysis(content: string): AnalysisResult {
  const withoutFence = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed: unknown = JSON.parse(withoutFence.slice(start, end + 1));
      const result = analysisResultSchema.safeParse(parsed);
      if (result.success) return result.data;
    } catch {
      // Fall back to displaying the model's text response safely.
    }
  }
  return {
    summary: withoutFence.slice(0, 1200) || "Chưa thể tạo bản phân tích từ dữ liệu hiện tại.",
    highlights: [],
    patterns: [],
    nextSteps: [],
  };
}

function buildAnalysisMessages(digest: ReturnType<typeof buildAnalysisDigest>) {
  return [
    {
      role: "system",
      content: `Bạn là trợ lý phân tích nhật ký sinh hoạt của em bé cho phụ huynh. Chỉ suy luận từ số liệu và nội dung ghi chú được cung cấp; không dùng chuẩn tăng trưởng bên ngoài, không chẩn đoán, không kết luận y khoa và không tạo dữ kiện không có trong đầu vào. Ghi chú là quan sát do phụ huynh nhập, cần được xem như ngữ cảnh chứ không phải kết luận y tế. Nếu dữ liệu ít hoặc có ngày trống, phải nói rõ giới hạn. Viết tiếng Việt ngắn gọn, bình tĩnh, dễ hiểu. Trả về duy nhất JSON hợp lệ theo cấu trúc: {"summary":"...","highlights":[{"title":"...","detail":"..."}],"patterns":[{"title":"...","detail":"..."}],"nextSteps":["..."]}. Mỗi mảng tối đa 4 mục. nextSteps chỉ là cách ghi chép hoặc điểm nên tiếp tục quan sát, không phải lời khuyên điều trị.`,
    },
    {
      role: "user",
      content: `Hãy phân tích bộ số liệu và ghi chú nhật ký sau:\n${JSON.stringify(digest)}`,
    },
  ];
}

function getCompletionContent(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("choices" in payload) || !Array.isArray(payload.choices)) {
    return null;
  }
  const choice = payload.choices[0];
  if (typeof choice !== "object" || choice === null || !("message" in choice)) return null;
  const message = choice.message;
  if (typeof message !== "object" || message === null || !("content" in message)) return null;
  return typeof message.content === "string" && message.content.trim() ? message.content : null;
}

function logRouterFailure(failure: RouterFailure) {
  console.error(`${failure.provider} analysis request failed`, {
    kind: failure.kind,
    ...(failure.status !== undefined ? { status: failure.status } : {}),
  });
}

async function requestRouter(config: RouterConfig, digest: ReturnType<typeof buildAnalysisDigest>): Promise<RouterResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTER_REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(config.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...config.headers,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          messages: buildAnalysisMessages(digest),
          stream: false,
          ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
        }),
      });
    } catch (error) {
      const failure: RouterFailure = {
        provider: config.provider,
        kind: error instanceof Error && error.name === "AbortError" ? "timeout" : "network",
      };
      logRouterFailure(failure);
      return { ok: false, failure };
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      const failure: RouterFailure = {
        provider: config.provider,
        kind: "http",
        status: response.status,
        ...(retryAfter ? { retryAfter } : {}),
      };
      logRouterFailure(failure);
      return { ok: false, failure };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      const failure: RouterFailure = { provider: config.provider, kind: "invalid-json" };
      logRouterFailure(failure);
      return { ok: false, failure };
    }

    const content = getCompletionContent(payload);
    if (!content) {
      const failure: RouterFailure = { provider: config.provider, kind: "empty-content" };
      logRouterFailure(failure);
      return { ok: false, failure };
    }

    return { ok: true, content, model: config.model };
  } finally {
    clearTimeout(timeout);
  }
}

function routerFailureResponse(failure: RouterFailure) {
  if (failure.kind === "timeout") {
    return NextResponse.json({ error: "Phân tích mất quá nhiều thời gian. Vui lòng thử lại." }, { status: 502 });
  }
  if (failure.kind === "network") {
    return NextResponse.json({ error: "Không thể kết nối dịch vụ phân tích." }, { status: 502 });
  }
  if (failure.kind === "empty-content") {
    return NextResponse.json({ error: "Model không trả về nội dung phân tích." }, { status: 502 });
  }

  const status = failure.status === 429 ? 429 : 502;
  const message = failure.status === 429
    ? "Dịch vụ phân tích đang bận. Vui lòng thử lại sau."
    : failure.status === 402
      ? `Tài khoản ${failure.provider} hiện không đủ hạn mức.`
      : "Dịch vụ phân tích tạm thời không phản hồi.";
  return NextResponse.json(
    { error: message },
    failure.retryAfter ? { status, headers: { "Retry-After": failure.retryAfter } } : { status },
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Bạn cần đăng nhập để xem phân tích." }, { status: 401 });
  const rawDays = Number(new URL(request.url).searchParams.get("days"));
  const parsedDays = analysisWindowSchema.safeParse(rawDays);
  if (!parsedDays.success) return NextResponse.json({ error: "Mốc thời gian không hợp lệ." }, { status: 400 });
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ error: "Chưa có hồ sơ của bé để phân tích." }, { status: 409 });
  const saved = await getSavedAnalysis(session.user.id, baby._id.toHexString(), parsedDays.data);
  if (!saved) return NextResponse.json({ result: null }, { headers: { "Cache-Control": "private, no-store" } });
  const result: AnalysisResponse = {
    analysis: saved.analysis,
    activityCount: saved.activityCount,
    generatedAt: saved.generatedAt.toISOString(),
    windowDays: saved.windowDays,
  };
  return NextResponse.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Bạn cần đăng nhập để sử dụng phân tích." }, { status: 401 });

  const nineRouterApiKey = process.env.NINE_ROUTER_API_KEY;
  const nineRouterModel = process.env.NINE_ROUTER_MODEL;
  if (!nineRouterApiKey || !nineRouterModel) {
    return NextResponse.json({ error: "Dịch vụ phân tích chưa được cấu hình." }, { status: 503 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }
  const parsedInput = analysisRequestSchema.safeParse(input);
  if (!parsedInput.success) return NextResponse.json({ error: "Mốc thời gian hoặc múi giờ không hợp lệ." }, { status: 400 });

  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ error: "Chưa có hồ sơ của bé để phân tích." }, { status: 409 });

  const docs = await listActivities(session.user.id, baby._id.toHexString(), 5000);
  const activities = docs.map(toActivityDto);
  const digest = buildAnalysisDigest(activities, parsedInput.data.timeZone, new Date(), parsedInput.data.days);
  if (digest.activityCount === 0) {
    return NextResponse.json({ error: `Chưa có hoạt động nào trong ${parsedInput.data.days} ngày gần nhất để phân tích.` }, { status: 422 });
  }

  const nextAllowedAt = analysisRateLimit.get(session.user.id) ?? 0;
  if (nextAllowedAt > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((nextAllowedAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: `Vui lòng chờ ${retryAfter} giây trước khi phân tích tiếp.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  analysisRateLimit.set(session.user.id, Date.now() + 15_000);
  if (analysisRateLimit.size > 1000) {
    const oldestUser = analysisRateLimit.keys().next().value;
    if (oldestUser) analysisRateLimit.delete(oldestUser);
  }

  let completion = await requestRouter({
    provider: "9router",
    url: "https://9router.baytham.com/v1/chat/completions",
    apiKey: nineRouterApiKey,
    model: nineRouterModel,
  }, digest);

  if (!completion.ok) {
    const openRouterApiKey = process.env.OPEN_ROUTER_KEY;
    const openRouterModel = process.env.OPEN_ROUTER_MODEL;
    if (!openRouterApiKey || !openRouterModel) {
      console.error("OpenRouter analysis fallback is not configured");
      return NextResponse.json({ error: "Dịch vụ phân tích dự phòng chưa được cấu hình." }, { status: 503 });
    }
    completion = await requestRouter({
      provider: "OpenRouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openRouterApiKey,
      model: openRouterModel,
      maxTokens: 1200,
      headers: { "X-Title": "Baby's Diary" },
    }, digest);
  }

  if (!completion.ok) return routerFailureResponse(completion.failure);

  const generatedAt = new Date();
  const result: AnalysisResponse = {
    analysis: extractAnalysis(completion.content),
    activityCount: digest.activityCount,
    generatedAt: generatedAt.toISOString(),
    windowDays: parsedInput.data.days,
  };
  await saveAnalysis({
    ownerId: session.user.id,
    babyId: baby._id.toHexString(),
    windowDays: parsedInput.data.days,
    timeZone: parsedInput.data.timeZone,
    model: completion.model,
    analysis: result.analysis,
    activityCount: result.activityCount,
    generatedAt,
  });

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
