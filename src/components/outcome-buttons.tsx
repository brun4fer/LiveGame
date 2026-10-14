"use client";

import { Circle } from "lucide-react";
import { cn } from "@/lib/cn";

export function OutcomeButtons({ value, onChange, disabled = false, compact = false }: {
  value: string | null;
  onChange: (outcome: "positive" | "negative") => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return <div className="flex shrink-0 items-center gap-1" aria-label="Moment result">
    <button type="button" aria-label="Mark as positive" aria-pressed={value === "positive"} disabled={disabled} title="Positive" className={cn("flex shrink-0 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-50", compact ? "h-6 w-6" : "h-7 w-7", value === "positive" ? "scale-105 border-emerald-200 bg-emerald-400 text-emerald-950 shadow-[0_0_16px_rgba(52,211,153,0.7)]" : "border-emerald-400/35 bg-emerald-400/10 text-emerald-300/75 hover:border-emerald-300 hover:bg-emerald-400/25 hover:text-emerald-200")} onClick={() => onChange("positive")}><Circle size={compact ? 10 : 12} className="fill-current" /></button>
    <button type="button" aria-label="Mark as negative" aria-pressed={value === "negative"} disabled={disabled} title="Negative" className={cn("flex shrink-0 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-50", compact ? "h-6 w-6" : "h-7 w-7", value === "negative" ? "scale-105 border-red-200 bg-red-400 text-red-950 shadow-[0_0_16px_rgba(248,113,113,0.65)]" : "border-red-400/35 bg-red-400/10 text-red-300/75 hover:border-red-300 hover:bg-red-400/25 hover:text-red-200")} onClick={() => onChange("negative")}><Circle size={compact ? 10 : 12} className="fill-current" /></button>
  </div>;
}
