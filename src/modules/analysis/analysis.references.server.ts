import { getAnalysisReference, type AnalysisReferenceId } from "./analysis.references";

type ReferenceCatalogContext = {
  babyAgeCompletedMonths: number | null;
  minimumRecordedDays: number;
  recordedDaysByCategory: {
    breastfeeding: number;
    sleep: number;
    tummy: number;
    solid: number;
  };
};

type ReferenceCatalogEntry = {
  id: AnalysisReferenceId;
  source: string;
  guidance: string;
};

function catalogEntry(id: AnalysisReferenceId, guidance: string): ReferenceCatalogEntry {
  const reference = getAnalysisReference(id);
  if (!reference) throw new Error(`Unknown analysis reference: ${id}`);
  return { id, source: reference.label, guidance };
}

export function buildAnalysisReferenceCatalog(context: ReferenceCatalogContext) {
  const ageMonths = context.babyAgeCompletedMonths;
  if (ageMonths === null) return [];

  const hasCoverage = (category: keyof ReferenceCatalogContext["recordedDaysByCategory"]) => (
    context.recordedDaysByCategory[category] >= context.minimumRecordedDays
  );
  const catalog: ReferenceCatalogEntry[] = [];

  const sleepGuidance: string[] = [];
  if (ageMonths < 60 && hasCoverage("sleep")) {
    sleepGuidance.push("WHO khuyến nghị giấc ngủ chất lượng tốt trong 24 giờ, gồm cả ngủ ngày: 14–17 giờ ở 0–3 tháng, 12–16 giờ ở 4–11 tháng, 11–14 giờ ở 1–2 tuổi và 10–13 giờ ở 3–4 tuổi. Nhật ký chỉ đo thời lượng được ghi, không đo chất lượng ngủ.");
  }
  if (ageMonths < 12 && hasCoverage("tummy")) {
    sleepGuidance.push("Với trẻ dưới 1 tuổi chưa tự di chuyển, WHO khuyến nghị ít nhất 30 phút nằm sấp khi thức, chia thành nhiều lần trong ngày. Nhật ký không cho biết bé đã tự di chuyển hay đã được ghi đủ, nên đối chiếu phải có điều kiện.");
  }
  if (sleepGuidance.length) {
    catalog.push(catalogEntry("WHO_SLEEP_ACTIVITY_2019", sleepGuidance.join(" ")));
  }

  if (ageMonths < 6 && hasCoverage("breastfeeding")) {
    catalog.push(catalogEntry("WHO_BREASTFEEDING_2024", "Trong 6 tháng đầu, phần lớn trẻ cần bú mẹ 8–12 lần trong 24 giờ. Chỉ được đối chiếu số lần breastfeedingSessions; không cộng cữ bình hoặc lần hút sữa, và không suy ra bé bú đủ, thiếu sữa hay được bú mẹ hoàn toàn từ nhật ký này."));
  }

  if (ageMonths >= 6 && ageMonths < 24 && hasCoverage("solid")) {
    catalog.push(catalogEntry("WHO_INFANT_FEEDING_2026", "Thức ăn bổ sung được bắt đầu khoảng 6 tháng tuổi. Mốc tham khảo là 2–3 bữa mỗi ngày ở 6–8 tháng và 3–4 bữa mỗi ngày ở 9–23 tháng, có thể thêm 1–2 bữa phụ khi cần. Nhật ký solid không phân biệt bữa chính, bữa phụ, lượng hoặc chất lượng món ăn nên chỉ được đối chiếu sơ bộ số lần ghi nhận."));
  }

  return catalog;
}
