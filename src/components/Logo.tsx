import Link from "next/link";

/** compact: the wordmark only shows from the sm breakpoint up (tight toolbars on phones). */
export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} aria-label={compact ? "Appmaker home" : undefined} className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-400 text-sm text-black shadow-lg shadow-brand-500/20">
        ◆
      </span>
      <span className={compact ? "hidden sm:inline" : undefined}>Appmaker</span>
    </Link>
  );
}
