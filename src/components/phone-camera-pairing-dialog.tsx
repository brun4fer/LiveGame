"use client";

import QRCode from "qrcode";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Smartphone, X } from "lucide-react";

import { Button, Panel } from "@/components/ui";
import { apiFetch } from "@/lib/http";

type Pairing = { url: string; expiresAt: string; matchTitle: string };

export function PhoneCameraPairingDialog({ matchId, onClose }: { matchId: string; onClose(): void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQr(null);
    try {
      const next = await apiFetch<Pairing>(`/api/matches/${matchId}/camera-pairing`, { method: "POST", body: "{}" });
      setPairing(next);
      setQr(await QRCode.toDataURL(next.url, { width: 360, margin: 2, color: { dark: "#061111", light: "#ffffff" } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The phone camera link could not be created.");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => { void generate(); }, [generate]);

  async function copy() {
    if (!pairing) return;
    await navigator.clipboard.writeText(pairing.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="phone-camera-title">
    <Panel className="max-h-[95dvh] w-full max-w-xl overflow-y-auto bg-pitch-950 p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-cyan-300"><Smartphone size={16} />Wireless phone camera</p><h2 id="phone-camera-title" className="mt-2 text-xl font-semibold text-white">Pair a phone with this match</h2></div><Button size="icon" aria-label="Close" onClick={onClose}><X size={17} /></Button></div>
      <p className="mt-3 text-sm leading-6 text-slate-400">Scan the QR code with the phone that will film. The phone publishes the live image; every account in this workspace can watch and rewind independently.</p>
      {loading ? <div className="flex min-h-72 items-center justify-center"><Loader2 size={28} className="animate-spin text-cyan-300" /></div> : error ? <div className="mt-5 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm leading-6 text-red-100">{error}</div> : pairing && qr ? <div className="mt-5 flex flex-col items-center"><div className="rounded-xl bg-white p-3"><Image unoptimized src={qr} width={256} height={256} alt={`QR code to use a phone camera for ${pairing.matchTitle}`} className="h-64 w-64" /></div><p className="mt-3 text-center text-xs text-slate-500">Valid until {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Open through HTTPS; a local HTTP address cannot access the phone camera.</p><div className="mt-4 flex w-full gap-2"><Button className="min-w-0 flex-1" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}</Button><Button onClick={() => void generate()} title="Generate a new link"><RefreshCw size={15} />Refresh</Button></div></div> : null}
      <ol className="mt-5 space-y-2 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400"><li><strong className="text-slate-200">1.</strong> Turn the phone horizontally and scan the code.</li><li><strong className="text-slate-200">2.</strong> Allow camera and microphone access, then select the rear camera.</li><li><strong className="text-slate-200">3.</strong> Press Start broadcast and keep the page open. Bluetooth is not used.</li><li><strong className="text-slate-200">4.</strong> At half-time, press Stop for interval; restart from the same page for the second half.</li></ol>
    </Panel>
  </div>;
}
