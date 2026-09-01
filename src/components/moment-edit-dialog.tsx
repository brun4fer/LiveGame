"use client";

import { useState } from "react";
import { Clock, X } from "lucide-react";

import { Button, Input, Label, Panel, Select, TextArea } from "@/components/ui";
import type { MomentRecord, MomentTypeRecord } from "@/lib/domain";
import { formatTime, roundTime } from "@/lib/time";

export function MomentEditDialog({ moment, momentTypes, currentTime, duration, onSave, onClose }: {
  moment: MomentRecord;
  momentTypes: MomentTypeRecord[];
  currentTime: number;
  duration: number;
  onSave: (input: { momentTypeId: string; startTimeSeconds: number; endTimeSeconds: number; notes: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [momentTypeId, setMomentTypeId] = useState(moment.momentTypeId);
  const [start, setStart] = useState(String(moment.startTimeSeconds));
  const [end, setEnd] = useState(String(moment.endTimeSeconds));
  const [notes, setNotes] = useState(moment.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const startSeconds = Number(start.replace(",", "."));
    const endSeconds = Number(end.replace(",", "."));
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds || (duration > 0 && endSeconds > duration)) {
      setError("Check the times: the end must be after the start and within the video duration.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ momentTypeId, startTimeSeconds: startSeconds, endTimeSeconds: endSeconds, notes: notes.trim() || null });
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
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2"><Label>Start time in seconds</Label><Input type="text" inputMode="decimal" className="font-mono text-base font-semibold text-white" placeholder="e.g. 612.4" value={start} onChange={(event) => setStart(event.target.value)} /><span className="text-[10px] text-slate-500">Preview: {formatTime(Number(start.replace(",", ".")) || 0)}</span><Button type="button" size="sm" onClick={() => setStart(String(roundTime(currentTime)))}><Clock size={13} />Use {formatTime(currentTime)}</Button></label><label className="grid gap-2"><Label>End time in seconds</Label><Input type="text" inputMode="decimal" className="font-mono text-base font-semibold text-white" placeholder="e.g. 618.3" value={end} onChange={(event) => setEnd(event.target.value)} /><span className="text-[10px] text-slate-500">Preview: {formatTime(Number(end.replace(",", ".")) || 0)}</span><Button type="button" size="sm" onClick={() => setEnd(String(roundTime(currentTime)))}><Clock size={13} />Use {formatTime(currentTime)}</Button></label></div>
        <label className="grid gap-2"><Label>Notes</Label><TextArea className="min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {error ? <p className="rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></div>
      </form>
    </Panel>
  </div>;
}

