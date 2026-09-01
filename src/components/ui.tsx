import { cn } from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({ className, variant = "secondary", size = "md", ...props }: ButtonProps) {
  return <button className={cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
    variant === "secondary" && "border border-white/10 bg-white/[.06] text-slate-100 hover:bg-white/[.11]",
    variant === "danger" && "border border-red-400/25 bg-red-500/10 text-red-100 hover:bg-red-500/20",
    variant === "ghost" && "text-slate-300 hover:bg-white/[.08] hover:text-white",
    size === "sm" && "h-8 px-2.5 text-xs",
    size === "md" && "h-10 px-3 text-sm",
    size === "lg" && "h-11 px-4 text-sm",
    size === "icon" && "h-9 w-9 p-0",
    className
  )} {...props} />;
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-lg border border-white/10 bg-white/[.045] shadow-panel backdrop-blur", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium uppercase tracking-[.18em] text-slate-500", className)} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("h-10 w-full rounded-md border border-white/10 bg-pitch-900 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("min-h-24 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10", props.className)} />;
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-md border border-white/10 bg-white/[.06] px-2 py-1 text-xs font-semibold text-slate-200", className)} {...props} />;
}

