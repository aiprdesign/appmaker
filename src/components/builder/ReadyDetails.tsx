"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Store, Trash2, X } from "lucide-react";
import { READY_PRESETS, type ReadyInfo, type ReadyItem } from "@/lib/ready-app";

const box = "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/70 focus:border-violet-400/60 focus:outline-none";
const input = `mt-1 w-full ${box}`;

function Text({ label, value, onChange, hint, type = "text", rows }: { label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string; rows?: number }) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      {rows ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} rows={rows} className={input} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} className={input} />
      )}
    </label>
  );
}

/**
 * "Your details" for a ready-made business app: everything the owner changes
 * to make the template theirs. The app on the phone updates as they type.
 */
export function ReadyDetails({ slug, info, onChange, onClose }: { slug: string; info: ReadyInfo; onChange: (info: ReadyInfo) => void; onClose: () => void }) {
  const preset = READY_PRESETS[slug];
  const [draft, setDraft] = useState(info);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Typing updates the app after a short pause, so the preview doesn't reload on every key.
  const set = (next: ReadyInfo) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 500);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const update = (k: keyof Omit<ReadyInfo, "items">, v: string) => set({ ...draft, [k]: v });
  const setItem = (i: number, patch: Partial<ReadyItem>) => set({ ...draft, items: draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  if (!preset) return null;
  const itemsWord = preset.itemsTab.toLowerCase();

  return (
    <section aria-labelledby="ready-title" className="flex max-h-full flex-col overflow-hidden rounded-2xl border border-line bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="ready-title" className="flex items-center gap-2 font-semibold">
          <Store className="h-4 w-4 text-violet-300" /> Your details
        </h2>
        <button onClick={onClose} aria-label="Close your details" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs text-muted">This app works already. Replace the example details with yours and watch the phone update. For bigger changes, ask the AI in the chat.</p>
        <Text label="Business name" value={draft.name} onChange={(v) => update("name", v)} />
        <Text label="Short line about you" value={draft.tagline} onChange={(v) => update("tagline", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Text label="Phone" type="tel" value={draft.phone} onChange={(v) => update("phone", v)} />
          <Text label="WhatsApp (optional)" type="tel" value={draft.whatsapp} onChange={(v) => update("whatsapp", v)} hint="Same as phone?" />
        </div>
        <Text label="Email" type="email" value={draft.email} onChange={(v) => update("email", v)} />
        <Text label="Address" value={draft.address} onChange={(v) => update("address", v)} />
        <Text label="Opening hours (one line each)" value={draft.hours} onChange={(v) => update("hours", v)} rows={3} />
        <label className="flex items-center gap-3 text-xs font-medium text-muted">
          Brand color
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : "#6D5DFB"} onChange={(e) => set({ ...draft, color: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent" />
        </label>

        <div>
          <h3 className="text-sm font-semibold">Your {itemsWord}</h3>
          <ul className="mt-2 space-y-2">
            {draft.items.map((it, i) => (
              <li key={i} className="space-y-2 rounded-xl border border-line bg-surface/60 p-3">
                <div className="flex gap-2">
                  <input aria-label={`Name ${i + 1}`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Name" className={`${box} min-w-0 flex-1`} />
                  <input aria-label={`Price ${i + 1}`} value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} placeholder="Price" className={`${box} w-24 shrink-0`} />
                  <button
                    onClick={() => set({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
                    aria-label={`Remove ${it.name || "item"}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input aria-label={`Description ${i + 1}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Short description" className={`${box} w-full`} />
                <input aria-label={`Category ${i + 1}`} value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} placeholder="Category" className={`${box} w-full`} />
              </li>
            ))}
          </ul>
          <button
            onClick={() => set({ ...draft, items: [...draft.items, { name: "", description: "", price: "", category: draft.items.at(-1)?.category ?? "" }] })}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20"
          >
            <Plus className="h-4 w-4" /> Add to {itemsWord}
          </button>
          <p className="mt-2 text-xs text-muted">Once your app database is on (Publish tab), you can also change these any time from your owner page, without a new app version.</p>
        </div>
      </div>
    </section>
  );
}
