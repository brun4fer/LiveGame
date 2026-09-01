"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";

import { Button, Input, Label, Panel, Select, TextArea } from "@/components/ui";
import type { MaintenanceRecord, MatchDetail } from "@/lib/domain";
import { apiFetch } from "@/lib/http";

export function MatchEditDialog({ match, onSave, onDelete, onClose }: {
  match: MatchDetail;
  onSave: (input: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    seasonId: match.seasonId || "",
    competitionId: match.competitionId || "",
    opponentClubId: match.opponentClubId || "",
    roundName: match.roundName || "",
    matchDate: match.matchDate?.slice(0, 10) || "",
    venue: match.venue || "",
    notes: match.notes || ""
  });
  const [seasons, setSeasons] = useState<MaintenanceRecord[]>([]);
  const [competitions, setCompetitions] = useState<MaintenanceRecord[]>([]);
  const [clubs, setClubs] = useState<MaintenanceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiFetch<MaintenanceRecord[]>("/api/maintenance/seasons"), apiFetch<MaintenanceRecord[]>("/api/maintenance/competitions"), apiFetch<MaintenanceRecord[]>("/api/maintenance/clubs")])
      .then(([seasonRows, competitionRows, clubRows]) => { setSeasons(seasonRows); setCompetitions(competitionRows); setClubs(clubRows); })
      .catch((caught: Error) => setError(caught.message));
  }, []);

  const availableCompetitions = useMemo(() => competitions.filter((item) => item.seasonId === form.seasonId), [competitions, form.seasonId]);
  const selectedCompetition = competitions.find((item) => item.id === form.competitionId);
  const availableClubs = clubs.filter((item) => selectedCompetition?.clubIds?.includes(item.id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await onSave(form); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the match."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Delete “${match.title}”, all moments and all submoments? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try { await onDelete(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete the match."); setBusy(false); }
  }

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4" role="dialog" aria-modal="true"><Panel className="my-6 w-full max-w-3xl p-5"><div className="flex items-center justify-between"><div><Label>Edit match</Label><h2 className="mt-1 text-xl font-bold text-white">{match.title}</h2></div><Button size="icon" variant="ghost" onClick={onClose}><X /></Button></div><form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submit}>
    <Choice label="Season" value={form.seasonId} items={seasons} onChange={(seasonId) => setForm((current) => ({ ...current, seasonId, competitionId: "", opponentClubId: "" }))} />
    <Choice label="Competition" value={form.competitionId} items={availableCompetitions} onChange={(competitionId) => setForm((current) => ({ ...current, competitionId, opponentClubId: "" }))} />
    <Choice label="Opponent" value={form.opponentClubId} items={availableClubs} onChange={(value) => update("opponentClubId", value)} />
    <Field label="Round"><Input value={form.roundName} onChange={(event) => update("roundName", event.target.value)} /></Field>
    <Field label="Date"><Input type="date" value={form.matchDate} onChange={(event) => update("matchDate", event.target.value)} /></Field>
    <Field label="Venue"><Input value={form.venue} onChange={(event) => update("venue", event.target.value)} /></Field>
    <Field label="Notes" className="md:col-span-2"><TextArea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></Field>
    {error ? <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100 md:col-span-2">{error}</div> : null}
    <div className="flex flex-wrap justify-between gap-2 md:col-span-2"><Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />Delete match</Button><div className="flex gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></div></div>
  </form></Panel></div>;
}

function Choice({ label, value, items, onChange }: { label: string; value: string; items: MaintenanceRecord[]; onChange: (value: string) => void }) {
  return <label className="grid gap-2"><Label>{label}</Label><Select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-2 ${className || ""}`}><Label>{label}</Label>{children}</label>;
}

