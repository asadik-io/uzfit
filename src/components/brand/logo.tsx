import { cn } from "@/lib/utils";

/** Original UzFit mark: an emerald tile with a lime "U" stroke that doubles as a pulse line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="#047857" />
      <path
        d="M9 8.5v7.5a7 7 0 0 0 14 0V8.5"
        fill="none"
        stroke="#BEF264"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="8.5" r="2.3" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-xl font-extrabold tracking-tight text-foreground">
        Uz<span className="text-primary">Fit</span>
      </span>
    </span>
  );
}
