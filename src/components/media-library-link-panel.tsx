"use client";

import { useEffect, useState } from "react";
import { Check, Cloud, Copy, Link2, Loader2 } from "lucide-react";

import { Button, Input, Label, Panel } from "@/components/ui";
import { apiFetch } from "@/lib/http";

type LinkStatus = { linked: boolean; linkedApps: string[] };
type LinkToken = { token: string; expiresAt: string };

const appLabels: Record<string, string> = {
  "player-analysis": "Player Analysis",
  "team-analysis": "Team Analysis",
  "opponent-analysis": "Opponent Analysis",
  "live-game": "Live Game",
};

export function MediaLibraryLinkPanel() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [token, setToken] = useState("");
  const [generated, setGenerated] = useState<LinkToken | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LinkStatus>("/api/media-library/link").then(setStatus).catch((error: Error) => setMessage(error.message));
  }, []);

  async function createCode() {
    setWorking(true);
    setMessage(null);
    try {
      setGenerated(await apiFetch<LinkToken>("/api/media-library/link", { method: "POST", body: JSON.stringify({ action: "create" }) }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create a linking code.");
    } finally {
      setWorking(false);
    }
  }

  async function linkWorkspace() {
    if (!token.trim()) return;
    setWorking(true);
    setMessage(null);
    try {
      const next = await apiFetch<LinkStatus>("/api/media-library/link", { method: "POST", body: JSON.stringify({ action: "claim", token }) });
      setStatus(next);
      setToken("");
      setGenerated(null);
      setMessage("The shared cloud library is now linked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not link the cloud library.");
    } finally {
      setWorking(false);
    }
  }

  async function copyCode() {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.token);
    setMessage("Linking code copied.");
  }

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
        <div>
          <div className="flex items-center gap-2"><Cloud size={17} className="text-cyan-300" /><Label>Shared cloud library</Label></div>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">Link the same client workspace across Live Game, Player, Team and Opponent applications. Recordings remain private and are never matched using the username alone.</p>
        </div>
        {status?.linked ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200"><Check size={11} />Linked</span> : null}
      </div>
      <div className="space-y-4 p-4">
        {status?.linkedApps.length ? <p className="text-xs text-slate-400">Connected applications: <strong className="text-slate-200">{status.linkedApps.map((app) => appLabels[app] || app).join(", ")}</strong></p> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[.025] p-3">
            <p className="text-sm font-semibold text-white">Link this application</p>
            <p className="mt-1 text-xs text-slate-500">Paste a code created in another application for this same client. Codes expire after 30 minutes and can only be used once.</p>
            <div className="mt-3 flex gap-2"><Input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste linking code" autoComplete="off" /><Button variant="primary" disabled={working || !token.trim()} onClick={() => void linkWorkspace()}>{working ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}Link</Button></div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[.025] p-3">
            <p className="text-sm font-semibold text-white">Connect another application</p>
            <p className="mt-1 text-xs text-slate-500">Create a temporary code, then paste it into the other application while signed in to the same client workspace.</p>
            {generated ? <div className="mt-3 flex gap-2"><Input readOnly value={generated.token} className="font-mono text-xs" /><Button onClick={() => void copyCode()}><Copy size={14} />Copy</Button></div> : <Button className="mt-3" disabled={working} onClick={() => void createCode()}>{working ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}Create linking code</Button>}
          </div>
        </div>
        {message ? <p className="text-xs text-cyan-100">{message}</p> : null}
      </div>
    </Panel>
  );
}
