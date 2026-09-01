"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Button, Input, Label, Panel } from "@/components/ui";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) return setError("The new passwords do not match.");
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
    const data = await response.json() as { error?: string; needsOnboarding?: boolean };
    setBusy(false);
    if (!response.ok) return setError(data.error || "Could not change the password.");
    router.replace(data.needsOnboarding ? "/onboarding" : "/");
    router.refresh();
  }

  return <div className="flex min-h-screen items-center justify-center px-4"><Panel className="w-full max-w-md p-7"><KeyRound className="text-leaf-400" /><h1 className="mt-4 text-2xl font-bold text-white">Set a private password</h1><p className="mt-2 text-sm text-slate-400">Change the temporary password before continuing.</p>{error ? <div className="mt-5 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}<form onSubmit={submit} className="mt-6 grid gap-4"><Password label="Temporary password" value={currentPassword} onChange={setCurrentPassword} /><Password label="New password" value={newPassword} onChange={setNewPassword} /><Password label="Confirm new password" value={confirmation} onChange={setConfirmation} /><Button variant="primary" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button></form></Panel></div>;
}

function Password({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2"><Label>{label}</Label><Input type="password" autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} required /></label>;
}

