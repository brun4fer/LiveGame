"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Loader2, Users } from "lucide-react";

import { Badge, Button, Label, Panel, Select } from "@/components/ui";
import { apiFetch } from "@/lib/http";

type TeamAccess = {
  members: Array<{ id: string; name: string; username: string; role: string }>;
  invites: Array<{ id: string; role: string; expiresAt: string; createdAt: string }>;
};

export function TeamAccessPanel() {
  const [data, setData] = useState<TeamAccess | null>(null);
  const [role, setRole] = useState("analyst");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { apiFetch<TeamAccess>("/api/workspace/invites").then(setData).catch((error: Error) => setMessage(error.message)); }, []);

  async function createInvite() {
    setWorking(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ code: string; expiresAt: string }>("/api/workspace/invites", { method: "POST", body: JSON.stringify({ role }) });
      setCode(result.code);
      setMessage("Invitation created. It expires in 24 hours and can be used once.");
      setData(await apiFetch<TeamAccess>("/api/workspace/invites"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be created.");
    } finally {
      setWorking(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(code);
    setMessage("Invitation code copied.");
  }

  return <Panel className="overflow-hidden">
    <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4"><div><div className="flex items-center gap-2"><Users size={17} className="text-cyan-300" /><Label>Team access</Label></div><p className="mt-1 text-xs text-slate-500">Invite staff to watch the same recording, rewind independently and create personal playlists.</p></div><Badge>{data?.members.length || 0} members</Badge></div>
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="divide-y divide-white/[.06] rounded-lg border border-white/10">{data?.members.map((member) => <div key={member.id} className="flex items-center justify-between gap-3 p-3"><span><span className="block text-sm font-semibold text-white">{member.name}</span><span className="text-xs text-slate-500">@{member.username}</span></span><Badge>{member.role}</Badge></div>) || <p className="p-4 text-xs text-slate-500">Loading team members…</p>}</div>
      <div className="space-y-3 rounded-lg border border-white/10 bg-white/[.025] p-3"><div><p className="text-sm font-semibold text-white">Create invitation</p><p className="mt-1 text-xs text-slate-500">Share the one-time code with a staff member after they create their account.</p></div><Select value={role} onChange={(event) => setRole(event.target.value)}><option value="analyst">Analyst</option><option value="admin">Administrator</option></Select>{code ? <div className="flex gap-2"><code className="min-w-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-cyan-100">{code}</code><Button size="icon" onClick={() => void copy()}><Copy size={14} /></Button></div> : null}<Button variant="primary" className="w-full" disabled={working} onClick={() => void createInvite()}>{working ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}Create invitation</Button>{message ? <p className="text-xs text-cyan-100">{message}</p> : null}</div>
    </div>
  </Panel>;
}
