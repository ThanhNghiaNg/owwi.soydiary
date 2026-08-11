import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { listActivities } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";
import { analysisRequestSchema, analysisResultSchema, type AnalysisResponse, type AnalysisResult } from "@/modules/analysis/analysis.dto";
import { buildAnalysisDigest } from "@/modules/analysis/analysis";

export const runtime = "nodejs";

type CacheEntry = { expiresAt: number; response: AnalysisResponse };

declare global {
  var __babytrackAnalysisCache: Map<string, CacheEntry> | undefined;
  var __babytrackAnalysisRateLimit: Map<string, number> | undefined;
}

const analysisCache = global.__babytrackAnalysisCache ?? new Map<string, CacheEntry>();
const analysisRateLimit = global.__babytrackAnalysisRateLimit ?? new Map<string, number>();
global.__babytrackAnalysisCache = analysisCache;
global.__babytrackAnalysisRateLimit = analysisRateLimit;

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

async function requestOpenRouter(digest: ReturnType<typeof buildAnalysisDigest>, apiKey: string, model: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    return await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Baby's Diary",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content: `Bạn là trợ lý phân tích nhật ký sinh hoạt của em bé cho phụ huynh. Chỉ suy luận từ số liệu được cung cấp; không dùng chuẩn tăng trưởng bên ngoài, không chẩn đoán, không kết luận y khoa và không tạo dữ kiện không có trong đầu vào. Nếu dữ liệu ít hoặc có ngày trống, phải nói rõ giới hạn. Viết tiếng Việt ngắn gọn, bình tĩnh, dễ hiểu. Trả về duy nhất JSON hợp lệ theo cấu trúc: {"summary":"...","highlights":[{"title":"...","detail":"..."}],"patterns":[{"title":"...","detail":"..."}],"nextSteps":["..."]}. Mỗi mảng tối đa 4 mục. nextSteps chỉ là cách ghi chép hoặc điểm nên tiếp tục quan sát, không phải lời khuyên điều trị.`,
          },
          {
            role: "user",
            content: `Hãy phân tích bộ số liệu tổng hợp sau:\n${JSON.stringify(digest)}`,
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Bạn cần đăng nhập để sử dụng phân tích." }, { status: 401 });

  const apiKey = process.env.OPEN_ROUTER_KEY;
  const model = process.env.OPEN_ROUTER_MODEL;
  if (!apiKey || !model) return NextResponse.json({ error: "Dịch vụ phân tích chưa được cấu hình." }, { status: 503 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }
  const parsedInput = analysisRequestSchema.safeParse(input);
  if (!parsedInput.success) return NextResponse.json({ error: "Không xác định được múi giờ của thiết bị." }, { status: 400 });

  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ error: "Chưa có hồ sơ của bé để phân tích." }, { status: 409 });

  const docs = await listActivities(session.user.id, baby._id.toHexString(), 300);
  const activities = docs.map(toActivityDto);
  const digest = buildAnalysisDigest(activities, parsedInput.data.timeZone);
  if (digest.activityCount === 0) {
    return NextResponse.json({ error: "Chưa có hoạt động nào trong 14 ngày gần nhất để phân tích." }, { status: 422 });
  }

  const latestUpdate = activities.reduce((latest, activity) => activity.updatedAt > latest ? activity.updatedAt : latest, "");
  const cacheKey = `${baby._id.toHexString()}:${model}:${parsedInput.data.timeZone}:${digest.activityCount}:${latestUpdate}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ...cached.response, cached: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const nextAllowedAt = analysisRateLimit.get(session.user.id) ?? 0;
  if (nextAllowedAt > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((nextAllowedAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: `Vui lòng chờ ${retryAfter} giây trước khi phân tích lại.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  analysisRateLimit.set(session.user.id, Date.now() + 15_000);
  if (analysisRateLimit.size > 1000) {
    const oldestUser = analysisRateLimit.keys().next().value;
    if (oldestUser) analysisRateLimit.delete(oldestUser);
  }

  let response: Response;
  try {
    response = await requestOpenRouter(digest, apiKey, model);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ error: timedOut ? "Phân tích mất quá nhiều thời gian. Vui lòng thử lại." : "Không thể kết nối dịch vụ phân tích." }, { status: 502 });
  }

  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    console.error("OpenRouter analysis request failed", { status: response.status });
    const status = response.status === 429 ? 429 : 502;
    const message = response.status === 429
      ? "Dịch vụ phân tích đang bận. Vui lòng thử lại sau."
      : response.status === 402
        ? "Tài khoản OpenRouter hiện không đủ hạn mức."
        : "Dịch vụ phân tích tạm thời không phản hồi.";
    return NextResponse.json(
      { error: message },
      retryAfter ? { status, headers: { "Retry-After": retryAfter } } : { status },
    );
  }

  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "Model không trả về nội dung phân tích." }, { status: 502 });
  }

  const result: AnalysisResponse = {
    analysis: extractAnalysis(content),
    activityCount: digest.activityCount,
    generatedAt: new Date().toISOString(),
    cached: false,
  };
  analysisCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, response: result });
  if (analysisCache.size > 100) {
    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) analysisCache.delete(oldestKey);
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
