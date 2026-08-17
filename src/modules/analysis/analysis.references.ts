export const analysisReferenceIds = [
  "WHO_SLEEP_ACTIVITY_2019",
  "WHO_BREASTFEEDING_2024",
  "WHO_INFANT_FEEDING_2026",
] as const;

export type AnalysisReferenceId = (typeof analysisReferenceIds)[number];

export const analysisReferences: ReadonlyArray<{
  id: AnalysisReferenceId;
  label: string;
  url: string;
}> = [
  {
    id: "WHO_SLEEP_ACTIVITY_2019",
    label: "WHO — Vận động, hành vi tĩnh tại và giấc ngủ trẻ dưới 5 tuổi (2019)",
    url: "https://www.who.int/publications/i/item/9789241550536",
  },
  {
    id: "WHO_BREASTFEEDING_2024",
    label: "WHO — Hỏi đáp về nuôi con bằng sữa mẹ (2024)",
    url: "https://www.who.int/news-room/questions-and-answers/item/breastfeeding",
  },
  {
    id: "WHO_INFANT_FEEDING_2026",
    label: "WHO — Nuôi dưỡng trẻ sơ sinh và trẻ nhỏ (2026)",
    url: "https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding",
  },
];

export function getAnalysisReference(id: AnalysisReferenceId) {
  return analysisReferences.find((reference) => reference.id === id);
}

export function isAnalysisReferenceId(value: string): value is AnalysisReferenceId {
  return (analysisReferenceIds as readonly string[]).includes(value);
}
