"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button, Input, Label, Panel } from "@/components/ui";
import { apiFetch } from "@/lib/http";

export function ManagementPasswordPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    if (password !== String(data.get("confirmation") || "")) {
      setMessage({ kind: "error", text: "The new passwords do not match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch("/api/management-access", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: data.get("currentPassword"), password })
      });
      form.reset();
      setMessage({ kind: "success", text: "Management password changed. Other open sessions have been locked." });
    } catch (cause) {
      setMessage({ kind: "error", text: cause instanceof Error ? cause.message : "The management password could not be changed." });
    } finally {
      setBusy(false);
    }
  }

  return <Panel className="p-4">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-200"><ShieldCheck size={19} /></span><div><Label>Security</Label><h2 className="mt-1 text-lg font-bold text-white">Management password</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">This password protects Matches, New match, Maintenance, Settings and match analysis. Maps, Reports and Help remain available without it. Changing it locks every other open session.</p></div></div>
    <form className="mt-4 grid gap-3 md:grid-cols-3 md:items-end" onSubmit={(event) => void submit(event)}>
      <div><Label htmlFor="current-management-password">Current password</Label><Input id="current-management-password" name="currentPassword" type="password" autoComplete="current-password" className="mt-1" required /></div>
      <div><Label htmlFor="new-management-password">New password</Label><Input id="new-management-password" name="password" type="password" autoComplete="new-password" className="mt-1" required /></div>
      <div><Label htmlFor="confirm-management-password">Confirm new password</Label><Input id="confirm-management-password" name="confirmation" type="password" autoComplete="new-password" className="mt-1" required /></div>
      <div className="md:col-span-2"><p className="text-[10px] text-slate-500">Use at least 8 characters, including one letter and one number.</p>{message ? <p role="status" className={`mt-1 text-xs ${message.kind === "success" ? "text-emerald-200" : "text-red-200"}`}>{message.text}</p> : null}</div>
      <Button variant="primary" disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}Change password</Button>
    </form>
  </Panel>;
}

