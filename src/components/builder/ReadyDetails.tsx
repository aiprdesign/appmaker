"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, ClipboardList, Globe, ImagePlus, KeyRound, Link2, Loader2, Plus, Store, Trash2, Upload, X } from "lucide-react";
import { READY_PRESETS, infoFromSite, parseItemList, safePayLink, type ReadyInfo, type ReadyItem } from "@/lib/ready-app";
import { uploadPhoto } from "@/lib/images";
import { DEFAULT_WORDING, type Wording } from "@/lib/claims";
import { claimsInText } from "@/lib/edit-claims";

const box = "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/70 focus:border-brand-400/60 focus:outline-none";
const input = `mt-1 w-full ${box}`;

/** A note under a field when its words make a claim (same checks as the AI's work). */
function ClaimNote({ text, wording }: { text: string; wording: Wording }) {
  const hits = claimsInText(text, wording);
  if (!hits.length) return null;
  const regulated = hits.some((h) => h.regulated);
  return (
    <p role="status" className={`mt-1 flex gap-1.5 text-xs ${regulated ? "text-red-300" : "text-amber-200"}`}>
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {hits.map((h) => `“${h.phrase}”`).join(", ")}: {regulated ? "a health or money claim. Remove it: app stores reject these." : "a claim customers can't check. Describe it plainly instead."}
      </span>
    </p>
  );
}

function Text({ label, value, onChange, hint, type = "text", rows, wording }: { label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string; rows?: number; wording?: Wording }) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      {rows ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} rows={rows} className={input} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} className={input} />
      )}
      {wording && <ClaimNote text={value} wording={wording} />}
    </label>
  );
}

/** One item's photo: upload one, pick one of the website's, or paste a link. */
function ItemPhoto({ name, image, photos, onChange, request = 0 }: { name: string; image?: string; photos: string[]; onChange: (image: string | undefined) => void; request?: number }) {
  const [open, setOpen] = useState(false);
  // Opened from the phone (the owner tapped this item's photo in the preview): open here and come into view.
  const [seen, setSeen] = useState(request);
  if (request !== seen) {
    setSeen(request);
    setOpen(true);
  }
  const here = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (request) here.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [request]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const label = name || "this item";
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError("");
    try {
      onChange(await uploadPhoto(f));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  return (
    <div ref={here}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={image ? `Change the photo of ${label}` : `Add a photo of ${label}`}
        className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-background/60 text-muted hover:border-white/30 hover:text-foreground"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5" aria-hidden />}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-background p-2 text-xs">
          <label className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 font-medium text-black ${busy ? "opacity-60" : ""}`}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />} Upload a photo
            <input ref={file} type="file" accept="image/*" disabled={busy} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          {photos.length > 0 && (
            <div>
              <p className="text-muted">Or pick one from your website:</p>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {photos.map((p) => (
                  <button key={p} onClick={() => (onChange(p), setOpen(false))} aria-label="Use this photo" className="aspect-square overflow-hidden rounded border border-line hover:border-white/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-1">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a photo link (https://…)" aria-label="Photo link" className={`${box} min-w-0 flex-1 py-1.5 text-xs`} />
            <button
              onClick={() => (/^https:\/\/\S+$/.test(link.trim()) ? (onChange(link.trim()), setOpen(false), setLink("")) : setError("Paste a link that starts with https://"))}
              aria-label="Use this link"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line hover:border-white/30"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {image && (
            <button onClick={() => (onChange(undefined), setOpen(false))} className="text-muted underline hover:text-foreground">
              Remove the photo
            </button>
          )}
          {error && (
            <p role="alert" className="text-amber-200">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Your details" for a ready-made business app: everything the owner changes
 * to make the template theirs. The app on the phone updates as they type.
 */
export function ReadyDetails({
  slug,
  info,
  onChange,
  onClose,
  ownerUrl = "",
  onOpenPublish,
  photoFor,
  sitePhotos = [],
  wording = DEFAULT_WORDING,
}: {
  slug: string;
  info: ReadyInfo;
  onChange: (info: ReadyInfo) => void;
  onClose: () => void;
  /** The business's owner page, once the app database is on. */
  ownerUrl?: string;
  onOpenPublish?: () => void;
  /** The owner tapped an item's photo on the phone: open that item's photo picker (n changes on every tap). */
  photoFor?: { item: string; n: number } | null;
  /** Photos from the website the app was made from (URL to App), ready to pick. */
  sitePhotos?: string[];
  /** Claim-safe wording: owner-typed text gets the same claim checks as the AI's. */
  wording?: Wording;
}) {
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
  // Filling in from the business's website: details, items with prices, and its photos to pick from.
  const [site, setSite] = useState("");
  const [reading, setReading] = useState(false);
  const [siteNote, setSiteNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [photos, setPhotos] = useState<string[]>(() => sitePhotos.filter((u) => u.startsWith("https://")).slice(0, 24));
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const fromSite = async () => {
    if (!site.trim()) return;
    setReading(true);
    setSiteNote(null);
    try {
      const res = await fetch("/api/site", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: site.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.site) throw new Error(body.error || "Couldn't read that website.");
      const found = infoFromSite(body.site, draft);
      set(found.info);
      setPhotos(found.photos);
      const n = body.site.items?.length ?? 0;
      setSiteNote({
        ok: true,
        text: `Filled in from ${body.site.siteName || "your website"}${n ? `, with ${n} ${n === 1 ? "item" : "items"} and prices` : ""}. Check everything below${n ? "" : `; your ${preset?.itemsTab.toLowerCase() ?? "items"} weren't on the site in a form Appmaker can read, so paste them in below`}.`,
      });
    } catch (e) {
      setSiteNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setReading(false);
    }
  };
  const addPasted = (replace: boolean) => {
    const items = parseItemList(pasted);
    if (!items.length) return;
    set({ ...draft, items: replace ? items : [...draft.items, ...items] });
    setPasted("");
    setPasting(false);
  };
  if (!preset) return null;
  const itemsWord = preset.itemsTab.toLowerCase();

  return (
    <section aria-labelledby="ready-title" className="flex max-h-full flex-col overflow-hidden rounded-2xl border border-line bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="ready-title" className="flex items-center gap-2 font-semibold">
          <Store className="h-4 w-4 text-brand-300" /> Your details
        </h2>
        <button onClick={onClose} aria-label="Close your details" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs text-muted">
          This app works already. Replace the example details with yours and watch the phone update. Tip: tap a photo or its camera badge on the phone to add a picture. For bigger changes, ask the AI in the chat.
        </p>
        <div className="rounded-xl border border-line bg-surface/60 p-3">
          <label htmlFor="ready-site" className="flex items-center gap-1.5 text-sm font-semibold">
            <Globe className="h-4 w-4 text-brand-300" aria-hidden /> Fill in from your website
          </label>
          <p className="mt-0.5 text-xs text-muted">Your name, contact details, hours, colors, photos and, when the site lists them, your {itemsWord} with prices.</p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void fromSite();
            }}
          >
            <input id="ready-site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourbusiness.com" inputMode="url" className={`${box} min-w-0 flex-1`} />
            <button type="submit" disabled={reading || !site.trim()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50">
              {reading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} {reading ? "Reading…" : "Fill in"}
            </button>
          </form>
          {siteNote && (
            <p role={siteNote.ok ? "status" : "alert"} className={`mt-2 text-xs ${siteNote.ok ? "text-emerald-300" : "text-amber-200"}`}>
              {siteNote.text}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-brand-400/30 bg-brand-500/10 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <KeyRound className="h-3.5 w-3.5 text-brand-300" aria-hidden /> Your business area is built in
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted">
            <li>
              <strong className="text-foreground">Staff mode in the app</strong> (Info → Staff mode): see new orders and requests, call customers and mark them ready or done. Try it now on the phone with a test order.
            </li>
            <li>
              <strong className="text-foreground">Your owner page</strong> on the web, with alerts for new orders, your {preset?.itemsTab.toLowerCase() ?? "items"}, customers&apos; requests and a staff PIN.
            </li>
          </ul>
          {ownerUrl ? (
            <a href={ownerUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black">
              <KeyRound className="h-4 w-4" aria-hidden /> Open your owner page<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <button onClick={onOpenPublish} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-400/40 px-3 text-sm hover:bg-brand-500/10">
              <KeyRound className="h-4 w-4" aria-hidden /> Get your owner page (turn on the app database)
            </button>
          )}
        </div>
        <Text label="Business name" value={draft.name} onChange={(v) => update("name", v)} wording={wording} />
        <Text label="Short line about you" value={draft.tagline} onChange={(v) => update("tagline", v)} wording={wording} />
        <div className="grid grid-cols-2 gap-3">
          <Text label="Phone" type="tel" value={draft.phone} onChange={(v) => update("phone", v)} />
          <Text label="WhatsApp (optional)" type="tel" value={draft.whatsapp} onChange={(v) => update("whatsapp", v)} hint="Same as phone?" />
        </div>
        <Text label="Email" type="email" value={draft.email} onChange={(v) => update("email", v)} />
        <Text label="Address" value={draft.address} onChange={(v) => update("address", v)} />
        <Text label="Opening hours (one line each)" value={draft.hours} onChange={(v) => update("hours", v)} rows={3} />
        <div>
          <Text label="PayPal.me link (optional)" value={draft.payLink ?? ""} onChange={(v) => update("payLink", v)} hint="paypal.me/yourshop" />
          {draft.payLink?.trim() && !safePayLink(draft.payLink) ? (
            <p role="status" className="mt-1 text-xs text-amber-200">Paste your PayPal.me link, like paypal.me/yourshop.</p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Customers get a <strong>Pay now</strong> button with the total filled in, or pay when they collect.{" "}
              <a href="https://www.paypal.com/paypalme/" target="_blank" rel="noreferrer" className="text-brand-300 underline underline-offset-2">
                Don&apos;t have one? Get a free PayPal.me link →
              </a>
              <span className="mt-1 block">Already published? Customers see a new link after you publish an update.</span>
            </p>
          )}
          {safePayLink(draft.payLink) && (
            <div className="mt-2 space-y-2">
              <a
                href={safePayLink(draft.payLink)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium hover:border-white/20"
              >
                Test your link
              </a>
              <label className="block text-xs font-medium text-muted">
                When can customers pay in the app?
                <select
                  value={draft.payWhen ?? "now"}
                  onChange={(e) => set({ ...draft, payWhen: e.target.value === "accepted" ? "accepted" : "now" })}
                  className={input}
                >
                  <option value="now">Right after ordering</option>
                  <option value="accepted">Once I accept the order (fewer refunds)</option>
                </select>
              </label>
            </div>
          )}
        </div>
        <label className="flex items-center gap-3 text-xs font-medium text-muted">
          Brand color
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : "#6D5DFB"} onChange={(e) => set({ ...draft, color: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent" />
        </label>

        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Your {itemsWord}</h3>
            <button onClick={() => setPasting(!pasting)} aria-expanded={pasting} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs hover:border-white/20">
              <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Paste a list
            </button>
          </div>
          {pasting && (
            <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface/60 p-3">
              <label htmlFor="ready-paste" className="text-xs text-muted">
                One per line: <span className="font-mono text-foreground">Name - description - price</span>. A line ending with &quot;:&quot; starts a category.
              </label>
              <textarea
                id="ready-paste"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={6}
                placeholder={"Pizza:\nMargherita - Tomato, basil - $11\nPepperoni $13\nDrinks:\nCola 2.50"}
                className={`${box} w-full font-mono text-xs`}
              />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => addPasted(true)} disabled={!pasted.trim()} className="min-h-9 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50">
                  Replace the list ({parseItemList(pasted).length})
                </button>
                <button onClick={() => addPasted(false)} disabled={!pasted.trim()} className="min-h-9 rounded-lg border border-line px-3 text-sm disabled:opacity-50">
                  Add to the list
                </button>
              </div>
            </div>
          )}
          <ul className="mt-2 space-y-2">
            {draft.items.map((it, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface/60 p-3">
                <ItemPhoto name={it.name} image={it.image} photos={photos} onChange={(image) => setItem(i, { image })} request={photoFor && photoFor.item === it.name ? photoFor.n : 0} />
                <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <input aria-label={`Name ${i + 1}`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Name" className={`${box} min-w-0 flex-1`} />
                  <input aria-label={`Price ${i + 1}`} value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} placeholder="Price" className={`${box} w-20 shrink-0`} />
                  <button
                    onClick={() => set({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
                    aria-label={`Remove ${it.name || "item"}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input aria-label={`Description ${i + 1}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Short description" className={`${box} w-full`} />
                <ClaimNote text={`${it.name}. ${it.description}`} wording={wording} />
                <input aria-label={`Category ${i + 1}`} value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} placeholder="Category" className={`${box} w-full`} />
                </div>
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
