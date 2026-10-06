"use client";

import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";

interface Access {
  locked: boolean;
  allowed: number;
  ip: string;
  ipAllowed: boolean;
}

const code = "rounded bg-surface-2 px-1 font-mono text-[0.85em] text-foreground";

/** The site lock: set on the host (Railway variables), shown here. */
export function AccessSection() {
  const [access, setAccess] = useState<Access | null>(null);
  useEffect(() => {
    fetch("/api/admin/access", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setAccess)
      .catch(() => setAccess(null));
  }, []);
  if (!access) return null;
  return (
    <section aria-labelledby="access-title" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="access-title" className="flex items-center gap-2 font-semibold">
        <LockKeyhole className="h-4 w-4 text-violet-300" /> Site lock
        <span
          className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${access.locked ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200"}`}
        >
          {access.locked ? "Locked with a PIN" : "Open to everyone"}
        </span>
      </h2>
      <p className="mt-2 text-sm text-muted">
        {access.locked
          ? "Visitors enter the PIN once per device (it lasts 30 days). The admin area, the legal pages and what published apps rely on stay open."
          : "Anyone can use the site. To make it private, add a PIN on your host."}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        <li>
          On Railway, open your service → <b className="text-foreground">Variables</b> and set <code className={code}>SITE_PIN</code> (for example 4–8 digits).
          Remove it to open the site; change it to sign every visitor out.
        </li>
        <li>
          To let addresses in without the PIN, set <code className={code}>SITE_ALLOWED_IPS</code> to a comma-separated list (ranges like{" "}
          <code className={code}>203.0.113.0/24</code> work too).{" "}
          {access.allowed ? `${access.allowed} address${access.allowed === 1 ? "" : "es"} allowed now.` : "None set now."}
        </li>
        <li>While you&apos;re signed in here, you skip the PIN too.</li>
        <li>3 wrong tries on the PIN or the admin password lock that visitor out for 15 minutes.</li>
      </ul>
      {access.ip && (
        <p className="mt-3 text-sm">
          Your address: <code className={code}>{access.ip}</code>{" "}
          <span className={access.ipAllowed ? "text-emerald-300" : "text-muted"}>{access.ipAllowed ? "· allowed without the PIN" : "· not on the list"}</span>
        </p>
      )}
    </section>
  );
}
