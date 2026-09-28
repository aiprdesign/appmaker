"use client";

import { useMemo, useState } from "react";
import { Check, CircleAlert, Copy, Download, ImageDown, Loader2, Star } from "lucide-react";
import type { ExpoState, Project, StoreListing } from "@/lib/types";
import { downloadBlob, exportProjectZip, renderIcon, shade, slugify } from "@/lib/export";
import { ExpoBuild } from "./ExpoBuild";
import { checkClaims, DEFAULT_WORDING } from "@/lib/claims";
import { checkRegulatedClaims } from "@/lib/regulated";

const CATEGORIES = [
  "Books", "Business", "Education", "Entertainment", "Finance", "Food & Drink", "Games", "Graphics & Design",
  "Health & Fitness", "Lifestyle", "Medical", "Music", "Navigation", "News", "Photo & Video", "Productivity",
  "Reference", "Shopping", "Social Networking", "Sports", "Travel", "Utilities", "Weather",
];

interface Props {
  project: Project;
  onChange: (listing: StoreListing) => void;
  onExpoChange: (expo: ExpoState) => void;
  hasPreviewError: boolean;
}

function isUrl(value?: string): boolean {
  if (!value) return false;
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function AppIcon({ listing, size = 64 }: { listing: StoreListing; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center shadow-lg"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.225,
        fontSize: size * 0.56,
        background: `linear-gradient(135deg, ${shade(listing.primaryColor, 0.25)}, ${shade(listing.primaryColor, -0.25)})`,
      }}
    >
      {listing.iconEmoji || "✨"}
    </div>
  );
}

function Field({
  label,
  hint,
  limit,
  value,
  children,
}: {
  label: string;
  hint?: string;
  limit?: number;
  value?: string;
  children: React.ReactNode;
}) {
  const over = limit != null && (value?.length ?? 0) > limit;
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground/90">{label}</span>
        {limit != null && (
          <span className={over ? "text-rose-400" : "text-muted"}>
            {value?.length ?? 0}/{limit}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-violet-500/60";

function CopyCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(cmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-[#0b0b10] px-3 py-2 text-left font-mono text-xs text-[#d8d6e6] hover:border-white/20"
    >
      <span className="truncate">$ {cmd}</span>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-muted group-hover:text-foreground" />}
    </button>
  );
}

export function PublishPanel({ project, onChange, onExpoChange, hasPreviewError }: Props) {
  const l = project.listing;
  const [exporting, setExporting] = useState(false);
  const set = <K extends keyof StoreListing>(key: K, value: StoreListing[K]) => onChange({ ...l, [key]: value });

  const claims = useMemo(() => checkClaims(project.files, l), [project.files, l]);
  const regulated = useMemo(() => checkRegulatedClaims(project.files, l), [project.files, l]);
  const checks = [
    { ok: Object.keys(project.files).length > 0, label: "App code generated" },
    { ok: !hasPreviewError, label: "Preview runs without errors" },
    { ok: l.name.trim().length > 1 && l.name.length <= 30, label: "App name set (≤ 30 characters)" },
    { ok: l.subtitle.trim().length > 0 && l.subtitle.length <= 30, label: "Subtitle set (≤ 30 characters)" },
    { ok: l.description.trim().length >= 100, label: "Description at least 100 characters" },
    { ok: l.keywords.trim().length > 0 && l.keywords.length <= 100, label: "Keywords set (≤ 100 characters)" },
    { ok: /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/.test(l.bundleId), label: "Valid bundle identifier" },
    {
      ok: !/^com\.appmaker\./.test(l.bundleId),
      label: "Bundle ID uses your own name (not com.appmaker…)",
      hint: "It's permanent once published — use your company or name, e.g. com.yourname.app",
    },
    { ok: l.privacyNotes.trim().length > 0, label: "Privacy details provided" },
    { ok: isUrl(l.supportUrl), label: "Support page link", hint: "Apple requires a page where users can get help" },
    { ok: isUrl(l.privacyPolicyUrl), label: "Privacy policy link", hint: "Both stores require a hosted privacy policy" },
    {
      ok: regulated.length === 0,
      label: "No health, medical or financial claims",
      hint: regulated.length
        ? `Found: ${regulated
            .slice(0, 3)
            .map((c) => (c.kind === "health disclaimer" ? `missing "not medical advice" line (${c.where.replace("Store listing: ", "listing ")})` : `“${c.phrase}”`))
            .join(", ")}${regulated.length > 3 ? ` and ${regulated.length - 3} more` : ""}. Apple rejects apps that make medical claims.`
        : undefined,
    },
    ...((project.wording ?? DEFAULT_WORDING) === "claim-safe"
      ? [
          {
            ok: claims.length === 0,
            label: "Claim-safe wording (no marketing claims)",
            hint: claims.length
              ? `Found: ${claims
                  .slice(0, 4)
                  .map((c) => `“${c.phrase}” (${c.where.replace("Store listing: ", "listing ")})`)
                  .join(", ")}${claims.length > 4 ? ` and ${claims.length - 4} more` : ""}. Ask the AI to "make the wording claim-safe".`
              : undefined,
          },
        ]
      : []),
  ];
  const ready = checks.filter((c) => c.ok).length;
  // Things only the stores can take; listed so "ready" never overpromises.
  const storeSteps = [
    "Screenshots of your app (take them from the preview, 6.9\" iPhone size for Apple)",
    "Age rating questionnaire (answered in App Store Connect / Play Console)",
    "Apple Developer account ($99/yr) and Google Play Console account ($25 once)",
    "App review — Apple and Google usually take 1–3 days",
  ];

  const download = async (p: Project = project) => {
    setExporting(true);
    try {
      downloadBlob(await exportProjectZip(p), `${slugify(p.listing.name)}-expo.zip`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-6 p-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">Store listing</h2>
            <p className="mt-1 text-xs text-muted">Used for App Store Connect and Google Play Console. Written by AI — edit freely.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="App name" limit={30} value={l.name}>
                <input className={input} value={l.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Subtitle" limit={30} value={l.subtitle}>
                <input className={input} value={l.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description" limit={4000} value={l.description}>
                  <textarea
                    className={`${input} min-h-36 resize-y`}
                    value={l.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Keywords" limit={100} value={l.keywords} hint="Comma separated, no spaces needed. Boosts App Store search.">
                  <input className={input} value={l.keywords} onChange={(e) => set("keywords", e.target.value)} />
                </Field>
              </div>
              <Field label="Primary category">
                <select className={input} value={l.category} onChange={(e) => set("category", e.target.value)}>
                  {!CATEGORIES.includes(l.category) && <option>{l.category}</option>}
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Bundle ID / package name" hint="Permanent once published, e.g. com.yourcompany.app">
                <input className={`${input} font-mono`} value={l.bundleId} onChange={(e) => set("bundleId", e.target.value.toLowerCase())} />
              </Field>
              <Field label="Support page URL" hint="Where users can get help — a simple page or contact form is fine.">
                <input
                  className={input}
                  type="url"
                  placeholder="https://yourwebsite.com/support"
                  value={l.supportUrl ?? ""}
                  onChange={(e) => set("supportUrl", e.target.value.trim())}
                />
              </Field>
              <Field label="Privacy policy URL" hint="A hosted privacy policy page (free generators exist).">
                <input
                  className={input}
                  type="url"
                  placeholder="https://yourwebsite.com/privacy"
                  value={l.privacyPolicyUrl ?? ""}
                  onChange={(e) => set("privacyPolicyUrl", e.target.value.trim())}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Privacy" hint="Summarize the data your app collects for the App Privacy section.">
                  <input className={input} value={l.privacyNotes} onChange={(e) => set("privacyNotes", e.target.value)} />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">App icon</h2>
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <AppIcon listing={l} size={96} />
              <div className="grid flex-1 gap-4 sm:grid-cols-2">
                <Field label="Emoji">
                  <input className={input} value={l.iconEmoji} maxLength={4} onChange={(e) => set("iconEmoji", e.target.value)} />
                </Field>
                <Field label="Brand color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(l.primaryColor) ? l.primaryColor : "#6d5dfb"}
                      onChange={(e) => set("primaryColor", e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface"
                    />
                    <input className={`${input} font-mono`} value={l.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} />
                  </div>
                </Field>
              </div>
              <button
                onClick={async () => downloadBlob(await renderIcon(l), `${slugify(l.name)}-icon-1024.png`)}
                className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:border-white/20"
              >
                <ImageDown className="h-4 w-4" /> 1024×1024 PNG
              </button>
            </div>
          </section>

          <ExpoBuild project={project} onExpoChange={onExpoChange} onDownload={download} hasPreviewError={hasPreviewError} />

          <details className="group rounded-2xl border border-line bg-surface p-5">
            <summary className="cursor-pointer list-none font-semibold">
              Build it yourself (command line)
              <span className="mt-1 block text-xs font-normal text-muted">Prefer your own computer or CI? Download the project and use the EAS CLI.</span>
            </summary>
            <ol className="mt-4 space-y-3 text-sm">
              <li>
                <div className="mb-1.5 text-muted">1. Install dependencies and try it on your phone with Expo Go</div>
                <CopyCommand cmd={`cd ${slugify(l.name)} && npm install && npx expo start`} />
              </li>
              <li>
                <div className="mb-1.5 text-muted">2. Log in to Expo{project.expo?.link ? " (the project is already linked)" : " and link the project"}</div>
                <CopyCommand cmd={project.expo?.link ? "npx eas-cli@latest login" : "npx eas-cli@latest login && npx eas-cli@latest init"} />
              </li>
              <li>
                <div className="mb-1.5 text-muted">3. Build store binaries for iOS and Android</div>
                <CopyCommand cmd="npx eas-cli@latest build --platform all --profile production" />
              </li>
              <li>
                <div className="mb-1.5 text-muted">4. Submit to App Store Connect and Google Play</div>
                <CopyCommand cmd="npx eas-cli@latest submit --platform all" />
              </li>
            </ol>
          </details>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">App Store preview</div>
            <div className="mt-4 rounded-xl bg-white p-4 text-black">
              <div className="flex gap-3">
                <AppIcon listing={l} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.name || "App name"}</div>
                  <div className="truncate text-xs text-neutral-500">{l.subtitle || "Subtitle"}</div>
                  <div className="mt-1 flex items-center gap-0.5 text-neutral-400">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="h-3 w-3 fill-current" />
                    ))}
                  </div>
                </div>
                <span className="self-center rounded-full bg-neutral-100 px-4 py-1 text-sm font-semibold text-blue-600">Get</span>
              </div>
              <p className="mt-3 line-clamp-4 text-xs text-neutral-600">{l.description || "Your description appears here."}</p>
              <div className="mt-2 text-[11px] text-neutral-600">{l.category}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Ready to export</h2>
              <span className="text-xs text-muted">
                {ready}/{checks.length}
              </span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-surface-2">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all"
                style={{ width: `${(ready / checks.length) * 100}%` }}
              />
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2">
                  {c.ok ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <span className={c.ok ? "text-foreground/90" : "text-muted"}>
                    {c.label}
                    {!c.ok && c.hint && <span className="mt-0.5 block text-[11px] text-muted">{c.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Also needed in the stores</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-muted">
                {storeSteps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => download()}
              disabled={exporting || !Object.keys(project.files).length}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Expo project
            </button>
            <p className="mt-2 text-center text-[11px] text-muted">Includes app.json, eas.json, icon and a GitHub build workflow.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
