"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";

import { Button, Input, Label, Panel } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (data.password !== data.confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not create the account.");
      router.replace("/onboarding");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the account.");
      setBusy(false);
    }
  }

  return <div className="flex min-h-screen items-center justify-center px-4 py-8">
    <Panel className="w-full max-w-md p-7">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200"><UserPlus /></span>
      <p className="mt-5 text-xs font-medium uppercase tracking-[.24em] text-cyan-200/80">Live Game</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Create your account</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">Create a private account for your team. After registration, you will choose the team name and configure the management password.</p>

      {error ? <div role="alert" className="mt-5 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

      <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-4">
        <label className="grid gap-2"><Label>Your name</Label><Input name="name" type="text" autoComplete="name" maxLength={80} placeholder="e.g. Bruno Silva" required autoFocus /></label>
        <label className="grid gap-2"><Label>Username</Label><Input name="username" type="text" autoCapitalize="none" autoComplete="username" minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" placeholder="e.g. bruno.silva" required /><span className="text-[10px] text-slate-500">Use 3–40 letters, numbers, dots, hyphens or underscores.</span></label>
        <label className="grid gap-2"><Label>Password</Label><Input name="password" type="password" autoComplete="new-password" minLength={10} required /><span className="text-[10px] text-slate-500">Use at least 10 characters, including uppercase, lowercase and a number.</span></label>
        <label className="grid gap-2"><Label>Confirm password</Label><Input name="confirmation" type="password" autoComplete="new-password" minLength={10} required /></label>
        <Button variant="primary" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}{busy ? "Creating account…" : "Create account"}</Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">Already have an account? <Link href="/login" className="font-medium text-cyan-300 hover:text-cyan-200">Sign in</Link></p>
    </Panel>
  </div>;
}
