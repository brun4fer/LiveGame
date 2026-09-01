import { SubmomentWorkspace } from "@/components/submoment-workspace";

export default async function SubmomentsPage({ params }: { params: Promise<{ matchId: string }> }) {
  return <SubmomentWorkspace matchId={(await params).matchId} />;
}

