"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { EMPTY_LEGAL, LEGAL_FIELDS, missingLegal, type LegalDetails } from "@/lib/site-legal";

/** The details that fill the blanks on /terms and /privacy. */
export function LegalSection() {
  const [draft, setDraft] = useState<LegalDetails | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    fetch("/api/admin/legal", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { legal: EMPTY_LEGAL }))
      .then((d) => setDraft(d.legal))
      .catch(() => setDraft(EMPTY_LEGAL));
  }, []);
  if (!draft) return null;
  const missing = missingLegal(draft);
  const save = async () => {
    const res = await fetch("/api/admin/legal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ legal: draft }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setNote({ ok: false, text: data.error || "Couldn't save." });
    setDraft(data.legal);
    const left = missingLegal(data.legal);
    setNote({ ok: true, text: left.length ? `Saved. Still to fill in: ${left.join(", ")}.` : "Saved. The terms and privacy policy show your details." });
  };
  return (
    <section aria-labelledby="legal-title" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="legal-title" className="flex items-center gap-2 font-semibold">
        <FileText className="h-4 w-4 text-violet-300" /> Legal details
      </h2>
      <p className="mt-1 text-sm text-muted">
        These fill the blanks on your{" "}
        <Link href="/terms" target="_blank" className="underline underline-offset-2">
          Terms of service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="underline underline-offset-2">
          Privacy policy
        </Link>
        . Until they&apos;re filled in, the pages show highlighted placeholders.
      </p>
      {missing.length > 0 && <p className="mt-2 text-xs text-amber-200">Missing: {missing.join(", ")}.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {LEGAL_FIELDS.map((f) => (
          <label key={f.key} className={`grid gap-1 text-xs text-muted ${f.key === "address" ? "sm:col-span-2" : ""}`}>
            <span className="font-medium text-foreground">{f.label}</span>
            <input
              type={f.key === "email" ? "email" : f.key === "effective" ? "date" : "text"}
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="min-h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground outline-none focus:border-violet-500/60"
            />
            <span>{f.hint}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={save} className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-sm font-medium text-black">
          Save legal details
        </button>
        {note && (
          <span role="status" className={`text-xs ${note.ok ? "text-emerald-300" : "text-amber-200"}`}>
            {note.text}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        The pages are a plain-language starting point that matches what Appmaker does. They aren&apos;t legal advice: have a lawyer review them for your
        business and the places you operate, especially the refund policy and liability limits.
      </p>
    </section>
  );
}
