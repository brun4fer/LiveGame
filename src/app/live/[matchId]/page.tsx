import { LiveWorkspace } from "@/components/live-workspace";

export default async function LiveMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  return <LiveWorkspace matchId={(await params).matchId} />;
}
