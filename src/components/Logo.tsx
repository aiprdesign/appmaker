import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-sm shadow-lg shadow-violet-500/30">
        ◆
      </span>
      <span>Appmaker</span>
    </Link>
  );
}
