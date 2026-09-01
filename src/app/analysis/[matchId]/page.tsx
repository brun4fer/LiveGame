import { AnalysisWorkspace } from "@/components/analysis-workspace";

export default async function AnalysisPage({ params }: { params: Promise<{ matchId: string }> }) {
  return <AnalysisWorkspace matchId={(await params).matchId} />;
}

