"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Clapperboard, Pencil, Play, Plus, Radio, Search, Trash2 } from "lucide-react";

import { MatchEditDialog } from "@/components/match-edit-dialog";
import { Badge, Button, Input, Panel } from "@/components/ui";
import type { AccountPayload, MatchDetail, MatchSummary } from "@/lib/domain";
import { apiFetch } from "@/lib/http";

export function Dashboard() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingMatch, setEditingMatch] = useState<MatchDetail | null>(null);
  const [teamName, setTeamName] = useState("Team");

  useEffect(() => {
    Promise.all([apiFetch<MatchSummary[]>("/api/matches"), apiFetch<AccountPayload>("/api/account")])
      .then(([rows, account]) => { setMatches(rows); setTeamName(account.teamName || "Team"); })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return matches;
    return matches.filter((match) =>
      [match.title, match.opponentName, match.competition]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [matches, query]);

  const totals = useMemo(() => ({
    matches: matches.length,
    moments: matches.reduce((sum, match) => sum + match.momentCount, 0),
    withVideo: matches.filter((match) => match.liveStatus).length,
  }), [matches]);

  async function removeMatch(match: MatchSummary) {
    if (!window.confirm(`Delete "${match.title}" and all associated moments?`)) return;
    await apiFetch<void>(`/api/matches/${match.id}`, { method: "DELETE" });
    setMatches((current) => current.filter((item) => item.id !== match.id));
    if (editingMatch?.id === match.id) setEditingMatch(null);
  }

  async function openEdit(matchId: string) {
    try {
      setEditingMatch(await apiFetch<MatchDetail>(`/api/matches/${matchId}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this match.");
    }
  }

  async function saveMatch(input: Record<string, unknown>) {
    if (!editingMatch) return;
    const saved = await apiFetch<MatchDetail>(`/api/matches/${editingMatch.id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    setMatches((current) => current.map((item) => item.id === saved.id ? { ...item, ...saved, momentCount: saved.moments.length } : item));
    setEditingMatch(null);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-lg border border-white/10 bg-gradient-to-br from-white/[.08] to-cyan-300/[.04] p-5 shadow-panel">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[.28em] text-cyan-200/80">Analysis hub</p>
              <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{teamName} matches</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Open a match, connect the camera and share a rewindable live recording with the full staff.</p>
            </div>
            <Link href="/matches/new" className="shrink-0"><Button variant="primary"><Plus size={17} />Create new match</Button></Link>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          <Stat label="Matches" value={totals.matches} />
          <Stat label="Moments" value={totals.moments} />
          <Stat label="Live sessions" value={totals.withVideo} />
        </div>
      </section>

      {error ? <Panel className="border-red-400/30 p-4 text-sm text-red-100">{error}</Panel> : null}
      {!loading && matches.length > 0 ? <div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} /><Input aria-label="Search matches" className="pl-10" placeholder="Search by opponent, competition or title" value={query} onChange={(event) => setQuery(event.target.value)} /></div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? Array.from({ length: 6 }).map((_, index) => <Panel key={index} className="h-56 animate-pulse bg-white/[.035]" />) : matches.length === 0 ? (
          <Panel className="md:col-span-2 xl:col-span-3"><div className="flex min-h-72 flex-col items-center justify-center px-5 text-center"><Clapperboard className="text-cyan-200" size={42} /><h2 className="mt-4 text-lg font-semibold text-white">No analyses yet</h2><p className="mt-2 max-w-md text-sm text-slate-400">Create the first match to start tagging tactical moments and their locations.</p><Link href="/matches/new" className="mt-5"><Button variant="primary"><Plus size={17} />New match</Button></Link></div></Panel>
        ) : filteredMatches.length === 0 ? <Panel className="md:col-span-2 xl:col-span-3 p-8 text-center text-sm text-slate-400">No matches found for “{query}”.</Panel> : filteredMatches.map((match) => (
          <Panel key={match.id} className="flex min-h-60 flex-col justify-between overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-semibold text-white">{match.title}</h2><p className="mt-1 truncate text-sm text-slate-400">{teamName} vs {match.opponentName}</p></div><Badge className="shrink-0 border-cyan-300/20 bg-cyan-300/10 text-cyan-100">{match.momentCount} {match.momentCount === 1 ? "moment" : "moments"}</Badge></div>
              <div className="mt-4 grid gap-2 text-sm text-slate-400"><Info icon={<Calendar size={15} />} value={formatDate(match.matchDate)} /><Info icon={<Clapperboard size={15} />} value={match.competition ?? "Competition not set"} /><Info icon={<Radio size={15} />} value={match.liveStatus === "LIVE" ? "Live recording in progress" : match.liveStatus === "ENDED" ? "Recording ready for review" : "Live session not started"} /></div>
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 bg-black/10 p-3"><Link href={`/live/${match.id}`} className="min-w-0 flex-1"><Button variant="primary" className="w-full"><Play size={16} />Open Live Game</Button></Link><Button size="icon" aria-label="Edit match" onClick={() => void openEdit(match.id)}><Pencil size={16} /></Button><Button variant="danger" size="icon" aria-label="Delete match" onClick={() => void removeMatch(match)}><Trash2 size={16} /></Button></div>
          </Panel>
        ))}
      </section>

      {editingMatch ? <MatchEditDialog match={editingMatch} onSave={saveMatch} onDelete={() => removeMatch(editingMatch)} onClose={() => setEditingMatch(null)} /> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <Panel className="p-4"><p className="text-xs uppercase tracking-[.2em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></Panel>;
}

function Info({ icon, value }: { icon: React.ReactNode; value: string }) {
  return <div className="flex min-w-0 items-center gap-2"><span className="text-cyan-200/80">{icon}</span><span className="truncate">{value}</span></div>;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "Date not set";
}
