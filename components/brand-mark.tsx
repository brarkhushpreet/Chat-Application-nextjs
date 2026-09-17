import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Nexus"
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#604bd6] ring-1 ring-black/5 dark:bg-[#6453d9] dark:ring-white/10",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true" fill="none">
        <path d="M8 24V8L24 24V8" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
