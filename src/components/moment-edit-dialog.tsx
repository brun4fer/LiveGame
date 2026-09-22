"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Button, Label, Panel, Select, TextArea } from "@/components/ui";
import type { MomentRecord, MomentTypeRecord } from "@/lib/domain";
import { formatTime, roundTime } from "@/lib/time";

export function MomentEditDialog({ moment, momentTypes, duration, onSave, onClose }: {
  moment: MomentRecord;
  momentTypes: MomentTypeRecord[];
  duration: number;
  onSave: (input: { momentTypeId: string; startTimeSeconds: number; endTimeSeconds: number; notes: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [momentTypeId, setMomentTypeId] = useState(moment.momentTypeId);
  const [start, setStart] = useState(moment.startTimeSeconds);
  const [end, setEnd] = useState(moment.endTimeSeconds);
  const [notes, setNotes] = useState(moment.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function adjustStart(delta: number) {
    setStart((value) => roundTime(Math.max(0, Math.min(value + delta, end - 0.1))));
  }

  function adjustEnd(delta: number) {
    setEnd((value) => roundTime(Math.max(start + 0.1, Math.min(duration > 0 ? duration : Number.MAX_SAFE_INTEGER, value + delta))));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (start < 0 || end <= start || (duration > 0 && end > duration)) {
      setError("Check the times: the end must be after the start and within the video duration.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ momentTypeId, startTimeSeconds: start, endTimeSeconds: end, notes: notes.trim() || null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the changes.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Edit moment">
    <Panel className="w-full max-w-lg p-5"><div className="flex items-center justify-between"><div><Label>Edit moment</Label><h2 className="mt-1 text-lg font-bold text-white">{moment.momentType.name}</h2></div><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X size={17} /></Button></div>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <label className="grid gap-2"><Label>Type</Label><Select value={momentTypeId} onChange={(event) => setMomentTypeId(event.target.value)}>{momentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></label>
        <div className="grid gap-3 sm:grid-cols-2"><TimeAdjuster label="Start" value={start} onMinus={() => adjustStart(-1)} onPlus={() => adjustStart(1)} /><TimeAdjuster label="End" value={end} onMinus={() => adjustEnd(-1)} onPlus={() => adjustEnd(1)} /></div>
        <div className="rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-center font-mono text-sm text-cyan-100" aria-label="Clip preview interval">Preview: {formatTime(start)} – {formatTime(end)}</div>
        <label className="grid gap-2"><Label>Notes</Label><TextArea className="min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {error ? <p className="rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></div>
      </form>
    </Panel>
  </div>;
}

function TimeAdjuster({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return <div className="grid gap-2"><Label>{label}</Label><div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-black/20"><button type="button" title={`Move ${label.toLowerCase()} back 1 second`} aria-label={`Move ${label.toLowerCase()} back 1 second`} onClick={onMinus} className="flex h-11 w-14 items-center justify-center border-r border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/[.08] hover:text-white">-1s</button><span className="min-w-0 flex-1 text-center font-mono text-lg font-semibold text-white">{formatTime(value)}</span><button type="button" title={`Move ${label.toLowerCase()} forward 1 second`} aria-label={`Move ${label.toLowerCase()} forward 1 second`} onClick={onPlus} className="flex h-11 w-14 items-center justify-center border-l border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/[.08] hover:text-white">+1s</button></div></div>;
}
