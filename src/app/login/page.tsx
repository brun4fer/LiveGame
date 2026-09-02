"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { Button, Input, Label, Panel } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await response.json() as { error?: string; mustChangePassword?: boolean; needsOnboarding?: boolean };
    setBusy(false);
    if (!response.ok) return setError(data.error || "Could not sign in.");
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(data.mustChangePassword ? "/change-password" : data.needsOnboarding ? "/onboarding" : next || "/");
    router.refresh();
  }

  return <div className="flex min-h-screen items-center justify-center px-4"><Panel className="w-full max-w-md p-7"><span className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200"><LockKeyhole /></span><h1 className="mt-5 text-2xl font-semibold text-white">Live Game</h1><p className="mt-2 text-sm text-slate-400">Sign in to access your team’s shared live feed, personal playlists and analysis data.</p>{error ? <div className="mt-5 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}<form onSubmit={submit} className="mt-6 grid gap-4"><label className="grid gap-2"><Label>Username</Label><Input type="text" autoCapitalize="none" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label className="grid gap-2"><Label>Password</Label><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><Button variant="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button></form><div className="mt-5 grid gap-3 text-center text-sm"><Link href="/demo" className="rounded-md border border-cyan-300/25 bg-cyan-300/5 px-4 py-2 font-medium text-cyan-200 hover:bg-cyan-300/10">Open database-free demo</Link><p className="text-slate-500">Don’t have an account yet? <Link href="/register" className="font-medium text-cyan-300 hover:text-cyan-200">Create account</Link></p></div></Panel></div>;
}
