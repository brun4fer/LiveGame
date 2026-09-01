"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Wrench } from "lucide-react";
import Link from "next/link";

import { Button, Input, Label, Panel, Select, TextArea } from "@/components/ui";
import type { AccountPayload, MaintenanceRecord, MatchDetail } from "@/lib/domain";
import { apiFetch } from "@/lib/http";

export function MatchForm() {
  const router = useRouter();
  const [form, setForm] = useState({ seasonId: "", competitionId: "", opponentClubId: "", roundName: "", matchDate: "", venue: "", notes: "" });
  const [seasons, setSeasons] = useState<MaintenanceRecord[]>([]);
  const [competitions, setCompetitions] = useState<MaintenanceRecord[]>([]);
  const [clubs, setClubs] = useState<MaintenanceRecord[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("Team");

  useEffect(() => {
    apiFetch<AccountPayload>("/api/account").then((account) => setTeamName(account.teamName || "Team")).catch(() => undefined);
    Promise.all([
      apiFetch<MaintenanceRecord[]>("/api/maintenance/seasons"),
      apiFetch<MaintenanceRecord[]>("/api/maintenance/competitions"),
      apiFetch<MaintenanceRecord[]>("/api/maintenance/clubs")
    ]).then(([seasonRows, competitionRows, clubRows]) => { setSeasons(seasonRows); setCompetitions(competitionRows); setClubs(clubRows); })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoadingOptions(false));
  }, []);

  const availableCompetitions = useMemo(() => competitions.filter((competition) => competition.seasonId === form.seasonId), [competitions, form.seasonId]);
  const selectedCompetition = competitions.find((competition) => competition.id === form.competitionId);
  const availableClubs = useMemo(() => clubs.filter((club) => selectedCompetition?.clubIds?.includes(club.id)), [clubs, selectedCompetition]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const match = await apiFetch<MatchDetail>("/api/matches", { method: "POST", body: JSON.stringify(form) });
      router.push(`/live/${match.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the match."); setSaving(false); }
  }

  const update = (name: keyof typeof form, value: string) => setForm((current) => ({ ...current, [name]: value }));

  return <div className="mx-auto max-w-4xl space-y-5">
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} />Back to matches</Link>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-leaf-400">Preparation</p><h1 className="mt-2 text-3xl font-bold text-white">New {teamName} match</h1><p className="mt-2 text-sm text-slate-400">Select the season, competition and opponent configured in Maintenance.</p></div><Link href="/maintenance"><Button><Wrench size={15} />Open Maintenance</Button></Link></div>
    <Panel className="p-5">{loadingOptions ? <div className="flex min-h-72 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Loading configured options…</div> : <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
      {error ? <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100 md:col-span-2">{error}</div> : null}
      <Choice label="Season" value={form.seasonId} items={seasons} onChange={(seasonId) => setForm((current) => ({ ...current, seasonId, competitionId: "", opponentClubId: "" }))} emptyMessage="No seasons are configured." />
      <Choice label="Competition" value={form.competitionId} items={availableCompetitions} disabled={!form.seasonId} onChange={(competitionId) => setForm((current) => ({ ...current, competitionId, opponentClubId: "" }))} emptyMessage="No competitions are configured for this season." />
      <Choice label="Opponent" value={form.opponentClubId} items={availableClubs} disabled={!form.competitionId} onChange={(opponentClubId) => update("opponentClubId", opponentClubId)} emptyMessage="No participating clubs are configured for this competition." />
      <Field label="Round"><Input value={form.roundName} onChange={(event) => update("roundName", event.target.value)} /></Field>
      <Field label="Date"><Input type="date" value={form.matchDate} onChange={(event) => update("matchDate", event.target.value)} /></Field>
      <Field label="Venue"><Input value={form.venue} onChange={(event) => update("venue", event.target.value)} /></Field>
      <Field label="Notes" className="md:col-span-2"><TextArea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></Field>
      <div className="flex justify-end gap-2 md:col-span-2"><Link href="/"><Button type="button">Cancel</Button></Link><Button variant="primary" disabled={saving || !form.seasonId || !form.competitionId || !form.opponentClubId}><Save size={16} />{saving ? "Saving…" : "Create match"}</Button></div>
    </form>}</Panel>
  </div>;
}

function Choice({ label, value, items, onChange, disabled = false, emptyMessage }: { label: string; value: string; items: MaintenanceRecord[]; onChange: (value: string) => void; disabled?: boolean; emptyMessage: string }) {
  return <label className="grid gap-2"><Label>{label} *</Label><Select value={value} required disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>{!disabled && items.length === 0 ? <span className="text-xs text-amber-200/70">{emptyMessage} Open Maintenance to add it.</span> : null}</label>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-2 ${className || ""}`}><Label>{label}</Label>{children}</label>;
}
