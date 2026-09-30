import { Globe, X } from "lucide-react";
import type { SiteSummary } from "@/lib/types";

/** Compact summary of an imported website: name, domain, pages read, what was found and brand colors. */
export function SiteCard({ site, onRemove }: { site: SiteSummary; onRemove?: () => void }) {
  const host = new URL(site.url).hostname.replace(/^www\./, "");
  const c = site.contact;
  const photos = site.images?.length ?? 0;
  const found = [
    site.logo && "logo",
    photos && `${photos} photo${photos === 1 ? "" : "s"}`,
    c?.phones.length && "phone",
    c?.address && "address",
    c?.hours.length && "hours",
    c?.booking && "booking link",
    c?.whatsapp && "WhatsApp",
  ].filter(Boolean) as string[];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-left">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-300">
        <Globe className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{site.siteName}</div>
        <div className="truncate text-xs text-muted">
          {host} · read {site.pages.length} page{site.pages.length === 1 ? "" : "s"}
        </div>
        {found.length > 0 && <div className="truncate text-xs text-emerald-300/90">Found {found.join(", ")}</div>}
      </div>
      {site.colors.length > 0 && (
        <div className="flex -space-x-1" aria-label="Brand colors">
          {site.colors.slice(0, 4).map((c) => (
            <span key={c} title={c} className="h-4 w-4 rounded-full border border-black/40" style={{ background: c }} />
          ))}
        </div>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded-md p-1 text-muted hover:bg-white/5 hover:text-foreground" aria-label="Remove website">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
