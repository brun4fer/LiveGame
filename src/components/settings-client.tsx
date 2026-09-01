"use client";

import { FormEvent, useEffect, useState } from "react";
import { Crosshair, Keyboard, Loader2, Pencil, Plus, Save, Target, Trash2, X } from "lucide-react";

import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { ManagementPasswordPanel } from "@/components/management-password-panel";
import { MediaLibraryLinkPanel } from "@/components/media-library-link-panel";
import { TeamAccessPanel } from "@/components/team-access-panel";
import type { MomentTypeRecord, SettingsPayload, SubMomentTypeRecord } from "@/lib/domain";
import { apiFetch } from "@/lib/http";

const emptyMoment = { name: "", code: "", color: "#2dd66f", defaultShortcut: "", allowedSubmomentIds: [] as string[] };
const emptySubmoment = {
  name: "",
  code: "",
  color: "#38bdf8",
  defaultShortcut: "",
  requiresFieldLocation: true,
  requiresGoalLocation: false
};

export function SettingsClient() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [momentForm, setMomentForm] = useState(emptyMoment);
  const [subForm, setSubForm] = useState(emptySubmoment);
  const [editingMomentId, setEditingMomentId] = useState<string | null>(null);
  const [editingSubmomentId, setEditingSubmomentId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SettingsPayload>("/api/settings")
      .then(setSettings)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  async function saveMoment(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError(null);
    try {
      const saved = await apiFetch<MomentTypeRecord>(
        `/api/settings/moment-types${editingMomentId ? `/${editingMomentId}` : ""}`,
        {
          method: editingMomentId ? "PATCH" : "POST",
          body: JSON.stringify(momentForm)
        }
      );
      setSettings({
        ...settings,
        momentTypes: editingMomentId
          ? settings.momentTypes.map((item) => (item.id === saved.id ? saved : item))
          : [...settings.momentTypes, saved]
      });
      cancelMomentEdit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the moment type.");
    }
  }

  async function saveSubmoment(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError(null);
    try {
      const saved = await apiFetch<SubMomentTypeRecord>(
        `/api/settings/submoment-types${editingSubmomentId ? `/${editingSubmomentId}` : ""}`,
        {
          method: editingSubmomentId ? "PATCH" : "POST",
          body: JSON.stringify(subForm)
        }
      );
      setSettings({
        ...settings,
        subMomentTypes: editingSubmomentId
          ? settings.subMomentTypes.map((item) => (item.id === saved.id ? saved : item))
          : [...settings.subMomentTypes, saved]
      });
      cancelSubmomentEdit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the submoment type.");
    }
  }

  async function remove(kind: "moment" | "submoment", id: string, name: string) {
    if (!settings || !confirm(`Delete “${name}”?`)) return;
    try {
      await apiFetch(`/api/settings/${kind}-types/${id}`, { method: "DELETE" });
      setSettings(
        kind === "moment"
          ? { ...settings, momentTypes: settings.momentTypes.filter((item) => item.id !== id) }
          : {
              ...settings,
              subMomentTypes: settings.subMomentTypes.filter((item) => item.id !== id),
              momentTypes: settings.momentTypes.map((item) => ({ ...item, allowedSubmoments: item.allowedSubmoments?.filter((submoment) => submoment.id !== id) }))
            }
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this type.");
    }
  }

  function editMoment(type: MomentTypeRecord) {
    setEditingMomentId(type.id);
    setMomentForm({
      name: type.name,
      code: type.code,
      color: type.color,
      defaultShortcut: type.defaultShortcut || "",
      allowedSubmomentIds: type.allowedSubmoments?.map((submoment) => submoment.id) || []
    });
  }

  function toggleAllowedSubmoment(id: string) {
    setMomentForm((current) => ({
      ...current,
      allowedSubmomentIds: current.allowedSubmomentIds.includes(id)
        ? current.allowedSubmomentIds.filter((item) => item !== id)
        : [...current.allowedSubmomentIds, id]
    }));
  }

  function editSubmoment(type: SubMomentTypeRecord) {
    setEditingSubmomentId(type.id);
    setSubForm({
      name: type.name,
      code: type.code,
      color: type.color,
      defaultShortcut: type.defaultShortcut || "",
      requiresFieldLocation: type.requiresFieldLocation,
      requiresGoalLocation: type.requiresGoalLocation
    });
  }

  function cancelMomentEdit() {
    setEditingMomentId(null);
    setMomentForm(emptyMoment);
  }

  function cancelSubmomentEdit() {
    setEditingSubmomentId(null);
    setSubForm(emptySubmoment);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
        <Loader2 className="mr-2 animate-spin" />Loading settings…
      </div>
    );
  }

  if (!settings) return <Panel className="p-4 text-red-100">{error}</Panel>;

  const allShortcuts = [
    ...settings.momentTypes.map((type) => ({ ...type, group: "Moment" })),
    ...settings.subMomentTypes.map((type) => ({ ...type, group: "Submoment" }))
  ];

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-leaf-400">Configuration</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Analysis settings</h1>
        <p className="mt-2 text-sm text-slate-400">
          Adjust shortcuts, main moments and submoment actions. Settings are private to this account.
        </p>
      </Panel>

      {error ? (
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      ) : null}

      <ManagementPasswordPanel />

      <TeamAccessPanel />

      <MediaLibraryLinkPanel />

      <div className="grid items-start gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <Panel className="overflow-hidden xl:sticky xl:top-24">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center gap-2">
              <Keyboard size={17} className="text-leaf-400" />
              <h2 className="font-bold text-white">Shortcuts</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">The keys shown on the analysis buttons.</p>
          </div>
          <div className="divide-y divide-white/[.06]">
            {allShortcuts.map((type) => (
              <button
                key={`${type.group}-${type.id}`}
                type="button"
                onClick={() => type.group === "Moment" ? editMoment(type) : editSubmoment(type as SubMomentTypeRecord)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[.05]"
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-200">{type.name}</span>
                  <span className="text-[10px] uppercase tracking-[.16em] text-slate-600">{type.group}</span>
                </span>
                <kbd className="min-w-8 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-center font-mono text-xs font-bold text-white">
                  {type.defaultShortcut?.toUpperCase() || "—"}
                </kbd>
              </button>
            ))}
          </div>
          <p className="border-t border-white/10 px-4 py-3 text-xs text-slate-600">
            Select a row, then change its key in the corresponding section.
          </p>
        </Panel>

        <div className="space-y-5">
          <Panel className="overflow-hidden">
            <div className="border-b border-white/10 p-4">
              <Label>Main moments</Label>
              <p className="mt-1 text-xs text-slate-500">The primary actions used while tagging the match.</p>
            </div>
            <div className="divide-y divide-white/[.06]">
              {settings.momentTypes.map((type) => (
                <div key={type.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: type.color }} />
                  <span className="min-w-44 flex-1">
                    <span className="block text-sm font-semibold text-white">{type.name}</span>
                    <span className="text-xs text-slate-500">{type.code}</span>
                  </span>
                  {type.defaultShortcut ? <Badge>{type.defaultShortcut.toUpperCase()}</Badge> : null}
                  <Badge>{type.allowedSubmoments?.length || 0} sub.</Badge>
                  <Button size="sm" onClick={() => editMoment(type)}><Pencil size={14} />Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => void remove("moment", type.id, type.name)}><Trash2 size={14} />Delete</Button>
                </div>
              ))}
            </div>
            <form onSubmit={saveMoment} className="space-y-4 border-t border-white/10 bg-black/10 p-4">
              <Label>{editingMomentId ? "Edit moment" : "Add moment"}</Label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_8rem_5rem_6rem_auto]">
                <Input placeholder="Name" value={momentForm.name} onChange={(event) => setMomentForm({ ...momentForm, name: event.target.value })} required />
                <Input placeholder="Code" value={momentForm.code} onChange={(event) => setMomentForm({ ...momentForm, code: event.target.value.toUpperCase() })} required />
                <Input aria-label="Moment color" type="color" className="p-1" value={momentForm.color} onChange={(event) => setMomentForm({ ...momentForm, color: event.target.value })} />
                <Input maxLength={1} placeholder="Key" value={momentForm.defaultShortcut} onChange={(event) => setMomentForm({ ...momentForm, defaultShortcut: event.target.value.slice(-1).toUpperCase() })} />
                <div className="flex gap-2">
                  <Button variant="primary" size="icon" aria-label={editingMomentId ? "Save moment" : "Add moment"}>{editingMomentId ? <Save size={15} /> : <Plus size={15} />}</Button>
                  {editingMomentId ? <Button type="button" size="icon" aria-label="Cancel edit" onClick={cancelMomentEdit}><X size={15} /></Button> : null}
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><Label>Available submoments</Label><p className="mt-1 text-xs text-slate-500">Only these actions will appear after selecting this moment.</p></div>
                  <Button type="button" size="sm" onClick={() => setMomentForm((current) => ({ ...current, allowedSubmomentIds: current.allowedSubmomentIds.length === settings.subMomentTypes.length ? [] : settings.subMomentTypes.map((item) => item.id) }))}>{momentForm.allowedSubmomentIds.length === settings.subMomentTypes.length ? "Clear" : "Select all"}</Button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {settings.subMomentTypes.map((submoment) => <label key={submoment.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/[.035] px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={momentForm.allowedSubmomentIds.includes(submoment.id)} onChange={() => toggleAllowedSubmoment(submoment.id)} className="h-4 w-4 accent-emerald-400" /><span className="h-3 w-3 rounded-full" style={{ backgroundColor: submoment.color }} /><span className="min-w-0 flex-1 truncate">{submoment.name}</span></label>)}
                  {settings.subMomentTypes.length === 0 ? <p className="text-xs text-amber-200/70">Create submoments first, then associate them with this moment.</p> : null}
                </div>
              </div>
            </form>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="border-b border-white/10 p-4">
              <Label>Submoment actions</Label>
              <p className="mt-1 text-xs text-slate-500">Actions shown above the submoment identification workspace.</p>
            </div>
            <div className="divide-y divide-white/[.06]">
              {settings.subMomentTypes.map((type) => (
                <div key={type.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: type.color }} />
                  <span className="min-w-44 flex-1">
                    <span className="block text-sm font-semibold text-white">{type.name}</span>
                    <span className="text-xs text-slate-500">{type.code}</span>
                  </span>
                  {type.defaultShortcut ? <Badge>{type.defaultShortcut.toUpperCase()}</Badge> : null}
                  {type.requiresFieldLocation ? <Badge><Crosshair size={12} />Pitch</Badge> : null}
                  {type.requiresGoalLocation ? <Badge><Target size={12} />Goal</Badge> : null}
                  <Button size="sm" onClick={() => editSubmoment(type)}><Pencil size={14} />Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => void remove("submoment", type.id, type.name)}><Trash2 size={14} />Delete</Button>
                </div>
              ))}
            </div>
            <form onSubmit={saveSubmoment} className="space-y-3 border-t border-white/10 bg-black/10 p-4">
              <Label>{editingSubmomentId ? "Edit submoment" : "Add submoment"}</Label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_8rem_5rem_6rem]">
                <Input placeholder="Name" value={subForm.name} onChange={(event) => setSubForm({ ...subForm, name: event.target.value })} required />
                <Input placeholder="Code" value={subForm.code} onChange={(event) => setSubForm({ ...subForm, code: event.target.value.toUpperCase() })} required />
                <Input aria-label="Submoment color" type="color" className="p-1" value={subForm.color} onChange={(event) => setSubForm({ ...subForm, color: event.target.value })} />
                <Input maxLength={1} placeholder="Key" value={subForm.defaultShortcut} onChange={(event) => setSubForm({ ...subForm, defaultShortcut: event.target.value.slice(-1).toUpperCase() })} />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={subForm.requiresFieldLocation} onChange={(event) => setSubForm({ ...subForm, requiresFieldLocation: event.target.checked })} />
                  Requires a pitch location
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={subForm.requiresGoalLocation} onChange={(event) => setSubForm({ ...subForm, requiresGoalLocation: event.target.checked })} />
                  Requires a goal location
                </label>
                <div className="ml-auto flex gap-2">
                  <Button variant="primary">{editingSubmomentId ? <Save size={15} /> : <Plus size={15} />}{editingSubmomentId ? "Save" : "Add"}</Button>
                  {editingSubmomentId ? <Button type="button" onClick={cancelSubmomentEdit}><X size={15} />Cancel</Button> : null}
                </div>
              </div>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
