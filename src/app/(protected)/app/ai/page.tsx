import { TopHeader } from "@/components/top-header";
import { AnalysisScreen } from "@/modules/analysis/analysis-screen";

export default function AnalysisPage() {
  return <div className="app-page">
    <TopHeader title="Phân tích" subtitle="Hiểu rõ hơn từ nhật ký của bé" />
    <AnalysisScreen />
  </div>;
}
