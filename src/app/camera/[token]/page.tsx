import { PhoneCameraSender } from "@/components/phone-camera-sender";
import { Panel } from "@/components/ui";
import { requireCameraPairing } from "@/lib/camera-pairing";

export const dynamic = "force-dynamic";

export default async function PhoneCameraPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const { match } = await requireCameraPairing(token);
    return <PhoneCameraSender token={token} matchTitle={match.title} />;
  } catch (error) {
    return <main className="flex min-h-dvh items-center justify-center p-5"><Panel className="max-w-lg p-6 text-center"><h1 className="text-xl font-semibold text-white">Camera link unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-400">{error instanceof Error ? error.message : "Generate a new camera QR code on the match computer."}</p></Panel></main>;
  }
}
