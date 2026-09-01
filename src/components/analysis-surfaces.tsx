"use client";

import { cn } from "@/lib/cn";

export type SurfacePoint = { id: string; x: number; y: number; color: string; label?: string; details?: string[]; active?: boolean };
export type Coordinate = { x: number; y: number };

function clickCoordinate(event: React.MouseEvent<HTMLElement>): Coordinate {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
    y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10
  };
}

function Markers({ points, onSelect }: { points: SurfacePoint[]; onSelect?: (id: string) => void }) {
  return points.map((point) => <span
    key={point.id}
    aria-label={[point.label, ...(point.details || [])].filter(Boolean).join(", ")}
    onClick={(event) => { event.stopPropagation(); onSelect?.(point.id); }}
    className={cn("group absolute z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-help rounded-full border-2 border-white shadow-[0_2px_10px_rgba(0,0,0,.7)] hover:z-30", onSelect && "cursor-pointer", point.active && "h-5 w-5 ring-4 ring-white/25")}
    style={{ left: `${point.x}%`, top: `${point.y}%`, backgroundColor: point.color }}
  >
    {point.label ? <span className={cn(
      "pointer-events-none absolute z-40 w-56 rounded-lg border border-white/15 bg-slate-950/95 px-3 py-2 text-left opacity-0 shadow-2xl backdrop-blur-sm transition-opacity group-hover:opacity-100",
      point.y < 30 ? "top-full mt-2" : "bottom-full mb-2",
      point.x < 25 ? "left-0" : point.x > 75 ? "right-0" : "left-1/2 -translate-x-1/2"
    )}>
      <strong className="block text-xs font-bold text-white">{point.label}</strong>
      {point.details?.map((detail, index) => <span key={`${point.id}-detail-${index}`} className="mt-1 block text-[11px] leading-4 text-slate-300">{detail}</span>)}
    </span> : null}
  </span>);
}

export function PitchSurface({ points = [], value, color = "#2dd66f", onChange, onPointSelect, className }: { points?: SurfacePoint[]; value?: Coordinate | null; color?: string; onChange?: (point: Coordinate) => void; onPointSelect?: (id: string) => void; className?: string }) {
  const selected = value ? [{ id: "selected", ...value, color, active: true }] : [];
  return <button type="button" aria-disabled={!onChange} onClick={(event) => onChange?.(clickCoordinate(event))} className={cn("relative block aspect-[1.55/1] w-full overflow-hidden rounded-xl border-2 border-white/25 bg-[#167641] text-left shadow-inner", onChange ? "cursor-crosshair" : "cursor-default", className)}>
    <svg viewBox="0 0 105 68" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <rect x="1" y="1" width="103" height="66" fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      <line x1="52.5" y1="1" x2="52.5" y2="67" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      <circle cx="52.5" cy="34" r="9.15" fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      <circle cx="52.5" cy="34" r=".8" fill="white" />
      <rect x="1" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      <rect x="87.5" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      <rect x="1" y="24.84" width="5.5" height="18.32" fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      <rect x="98.5" y="24.84" width="5.5" height="18.32" fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      <circle cx="11" cy="34" r=".7" fill="white" /><circle cx="94" cy="34" r=".7" fill="white" />
      <path d="M17.5 27a9.15 9.15 0 0 1 0 14" fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      <path d="M87.5 27a9.15 9.15 0 0 0 0 14" fill="none" stroke="rgba(255,255,255,.82)" strokeWidth=".7" />
      {[26.25, 78.75].map((x) => <line key={x} x1={x} y1="1" x2={x} y2="67" stroke="rgba(255,255,255,.18)" strokeWidth=".35" strokeDasharray="1.5 1.5" />)}
      {[22.67, 45.33].map((y) => <line key={y} x1="1" y1={y} x2="104" y2={y} stroke="rgba(255,255,255,.18)" strokeWidth=".35" strokeDasharray="1.5 1.5" />)}
    </svg>
    <Markers points={[...points, ...selected]} onSelect={onPointSelect} />
  </button>;
}

export function GoalSurface({ points = [], value, color = "#facc15", onChange, onPointSelect, className }: { points?: SurfacePoint[]; value?: Coordinate | null; color?: string; onChange?: (point: Coordinate) => void; onPointSelect?: (id: string) => void; className?: string }) {
  const selected = value ? [{ id: "selected-goal", ...value, color, active: true }] : [];
  return <button type="button" aria-disabled={!onChange} onClick={(event) => onChange?.(clickCoordinate(event))} className={cn("relative block aspect-[2/1] w-full overflow-hidden rounded-xl border border-white/20 bg-gradient-to-b from-slate-800 to-slate-950", onChange ? "cursor-crosshair" : "cursor-default", className)}>
    <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <path d="M10 44V8h80v36" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2" />
      {Array.from({ length: 9 }, (_, index) => <line key={`v-${index}`} x1={10 + index * 10} y1="8" x2={10 + index * 10} y2="44" stroke="rgba(255,255,255,.18)" strokeWidth=".5" />)}
      {Array.from({ length: 5 }, (_, index) => <line key={`h-${index}`} x1="10" y1={8 + index * 9} x2="90" y2={8 + index * 9} stroke="rgba(255,255,255,.18)" strokeWidth=".5" />)}
      <line x1="50" y1="8" x2="50" y2="44" stroke="rgba(255,255,255,.4)" strokeDasharray="2 2" />
    </svg>
    <Markers points={[...points, ...selected]} onSelect={onPointSelect} />
  </button>;
}

