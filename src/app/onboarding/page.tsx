"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, ShieldCheck, Users } from "lucide-react";

import { Button, Input, Label, Panel } from "@/components/ui";

type Mode = "create" | "join";

export default function OnboardingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const joining = mode === "join";
    const response = await fetch(joining ? "/api/account/team/join" : "/api/account/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(joining ? { code: inviteCode } : { teamName }),
    });
    const data = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return setError(data.error || (joining ? "Could not join the team." : "Could not create the team space."));
    router.replace("/");
    router.refresh();
  }

  return <div className="flex min-h-screen items-center justify-center px-4">
    <Panel className="w-full max-w-xl p-7">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200"><ShieldCheck /></span>
      <p className="mt-5 text-xs font-medium uppercase tracking-[.24em] text-cyan-200/80">First setup</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Connect your Live Game workspace</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">Create a new team or use an invitation code to join staff already working on the same live recording.</p>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/15 p-1">
        <button type="button" onClick={() => { setMode("create"); setError(""); }} className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold ${mode === "create" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:bg-white/[.06]"}`}><Users size={15} />Create team</button>
        <button type="button" onClick={() => { setMode("join"); setError(""); }} className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold ${mode === "join" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:bg-white/[.06]"}`}><Link2 size={15} />Join team</button>
      </div>

      {error ? <div className="mt-5 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      <form onSubmit={submit} className="mt-5 grid gap-4">
        {mode === "create" ? <label className="grid gap-2"><Label>Team name</Label><Input autoFocus maxLength={80} placeholder="e.g. First Team" value={teamName} onChange={(event) => setTeamName(event.target.value)} required /></label> : <label className="grid gap-2"><Label>Invitation code</Label><Input autoFocus autoComplete="off" placeholder="Paste the code shared by your staff" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required /></label>}
        <Button variant="primary" disabled={busy || (mode === "create" ? teamName.trim().length < 2 : inviteCode.trim().length < 20)}>{busy ? "Connecting…" : mode === "create" ? "Create workspace" : "Join workspace"}</Button>
      </form>
    </Panel>
  </div>;
}
