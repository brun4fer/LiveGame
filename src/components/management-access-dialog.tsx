"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BarChart3, KeyRound, Loader2, LockKeyhole, Map, ShieldCheck, X } from "lucide-react";

import { Button, Input, Label, Panel } from "@/components/ui";
import { apiFetch } from "@/lib/http";

export function ManagementAccessDialog({ configured, canDismiss, onDismiss, onUnlocked }: {
  configured: boolean;
  canDismiss: boolean;
  onDismiss: () => void;
  onUnlocked: () => void;
}) {
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setup = !configured;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("confirmation") || "");
    if ((setup || recovering) && password !== confirmation) {
      setError("The passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      await apiFetch("/api/management-access", {
        method: "POST",
        body: JSON.stringify({
          action: setup ? "setup" : recovering ? "reset" : "unlock",
          password,
          accountPassword: data.get("accountPassword")
        })
      });
      onUnlocked();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Management access could not be unlocked.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
    <Panel className="relative w-full max-w-lg overflow-hidden border-cyan-300/20 bg-pitch-950 p-5 shadow-2xl sm:p-6">
      {canDismiss ? <button type="button" aria-label="Close" onClick={onDismiss} className="absolute right-4 top-4 text-slate-500 hover:text-white"><X size={17} /></button> : null}
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
        {setup ? <ShieldCheck size={21} /> : recovering ? <KeyRound size={21} /> : <LockKeyhole size={21} />}
      </div>
      <Label className="mt-4 block">Administrative protection</Label>
      <h2 className="mt-1 text-xl font-bold text-white">{setup ? "Create a management password" : recovering ? "Reset the management password" : "Unlock management areas"}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        {setup
          ? "This separate password protects Matches, New match, Maintenance, Settings and every match analysis. Maps, Reports and Help remain available without it. You will enter it once per sign-in session."
          : recovering
            ? "Confirm your identity with the account sign-in password, then create a new management password. Other open sessions will be locked."
            : "Enter the management password to open Matches, New match, Maintenance, Settings and match analysis. It will remain unlocked until you sign out."}
      </p>

      <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event)}>
        {recovering ? <div><Label htmlFor="account-password">Account sign-in password</Label><Input id="account-password" name="accountPassword" type="password" autoComplete="current-password" className="mt-1" required /></div> : null}
        <div><Label htmlFor="management-password">{setup || recovering ? "New management password" : "Management password"}</Label><Input id="management-password" name="password" type="password" autoComplete={setup || recovering ? "new-password" : "current-password"} className="mt-1" required autoFocus /></div>
        {setup || recovering ? <div><Label htmlFor="management-confirmation">Confirm management password</Label><Input id="management-confirmation" name="confirmation" type="password" autoComplete="new-password" className="mt-1" required /><p className="mt-1.5 text-[10px] text-slate-500">Use at least 8 characters, including one letter and one number.</p></div> : null}
        {error ? <p role="alert" className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
        <Button variant="primary" className="w-full" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <LockKeyhole size={15} />} {setup ? "Create password and unlock" : recovering ? "Reset password and unlock" : "Unlock management areas"}</Button>
      </form>

      {configured ? <button type="button" onClick={() => { setRecovering((value) => !value); setError(null); }} className="mt-3 w-full text-center text-xs text-slate-500 hover:text-cyan-200">{recovering ? "Back to password entry" : "Forgot the management password?"}</button> : null}

      {!canDismiss ? <div className="mt-5 border-t border-white/10 pt-4"><p className="text-center text-[10px] uppercase tracking-[.14em] text-slate-600">Available without the management password</p><div className="mt-2 grid grid-cols-2 gap-2"><Link href="/maps" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[.04] text-xs text-slate-300 hover:bg-white/[.08] hover:text-white"><Map size={14} />Maps</Link><Link href="/reports" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[.04] text-xs text-slate-300 hover:bg-white/[.08] hover:text-white"><BarChart3 size={14} />Reports</Link></div></div> : null}
    </Panel>
  </div>;
}

