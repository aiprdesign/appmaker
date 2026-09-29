"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, Search, ShieldCheck } from "lucide-react";
import { FEATURES, FEATURE_KEYS, type FeatureKey, type Features } from "@/lib/features";

type Tab = "overview" | "members" | "settings";

interface Overview {
  members: number;
  newMembers7d: number;
  activeMembers7d: number;
  apps: number;
  appsUpdated7d: number;
  withPasskeys: number;
  withGoogle: number;
  signupsByDay: { day: string; count: number }[];
}

interface Member {
  id: string;
  email: string;
  joinedAt: number;
  lastActiveAt: number | null;
  password: boolean;
  google: boolean;
  passkeys: number;
  apps: number;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T & { error?: string } }> {
  const res = await fetch(path, { ...init, credentials: "same-origin", headers: { "content-type": "application/json", ...init.headers } });
  return { status: res.status, data: await res.json().catch(() => ({}) as T & { error?: string }) };
}

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-violet-500/60";

function when(ts: number | null): string {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 86400_000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(ts).toLocaleDateString();
}

export function AdminApp() {
  const [state, setState] = useState<"loading" | "off" | "login" | "in">("loading");
  const [features, setFeatures] = useState<Features | null>(null);
  const [meta, setMeta] = useState<{ database: boolean; googleKeys: boolean }>({ database: false, googleKeys: false });
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    const { status, data } = await api<{ features: Features; database: boolean; googleKeys: boolean }>("/api/admin/features");
    if (status === 404) return setState("off");
    if (status === 401) return setState("login");
    if (status === 200) {
      setFeatures(data.features);
      setMeta({ database: data.database, googleKeys: data.googleKeys });
      setState("in");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state === "loading") return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted" aria-label="Loading" />;
  if (state === "off") {
    return (
      <div className="mx-auto max-w-md text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Admin is off</h1>
        <p className="mt-2 text-sm text-muted">
          Set an <code className="font-mono">ADMIN_PASSWORD</code> variable on the server (Railway → your service → Variables) and deploy. Then come back here and
          sign in with it.
        </p>
      </div>
    );
  }
  if (state === "login") return <AdminLogin onIn={load} />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-violet-400" /> Admin
        </h1>
        <button
          onClick={async () => {
            await api("/api/admin/logout", { method: "POST", body: "{}" });
            setState("login");
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out of admin
        </button>
      </div>
      {!meta.database && (
        <p role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100">
          No database is connected, so there are no members yet and switches can&apos;t be saved. Add <code className="font-mono">DATABASE_URL</code> first.
        </p>
      )}
      <div role="tablist" aria-label="Admin sections" className="mt-6 flex gap-1 border-b border-line">
        {(["overview", "members", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-10 border-b-2 px-4 text-sm capitalize ${tab === t ? "border-violet-400 font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "overview" && (meta.database ? <OverviewTab /> : null)}
        {tab === "members" && (meta.database ? <MembersTab /> : null)}
        {tab === "settings" && features && <SettingsTab features={features} setFeatures={setFeatures} meta={meta} />}
      </div>
    </div>
  );
}

function AdminLogin({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mx-auto max-w-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const { status, data } = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
        setBusy(false);
        if (status === 200) onIn();
        else setError(data.error || "Couldn't sign in.");
      }}
    >
      <ShieldCheck className="h-8 w-8 text-violet-400" />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Admin sign-in</h1>
      <p className="mt-2 text-sm text-muted">
        Use the password set in the server&apos;s <code className="font-mono">ADMIN_PASSWORD</code> variable.
      </p>
      <label className="mt-6 block">
        <span className="mb-1.5 block text-xs font-medium">Admin password</span>
        <input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
      </button>
    </form>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Overview>("/api/admin/overview").then(({ status, data }) => (status === 200 ? setData(data) : setError(data.error || "Couldn't load the numbers.")));
  }, []);
  if (error) return <p role="alert" className="text-sm text-rose-300">{error}</p>;
  if (!data) return <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading" />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Members" value={data.members} />
        <Stat label="New this week" value={data.newMembers7d} />
        <Stat label="Active this week" value={data.activeMembers7d} sub="signed in or edited an app" />
        <Stat label="Apps in accounts" value={data.apps} />
        <Stat label="Apps edited this week" value={data.appsUpdated7d} />
        <Stat label="Use passkeys" value={data.withPasskeys} sub={`${data.withGoogle.toLocaleString()} use Google`} />
      </div>
      <SignupsChart days={data.signupsByDay} />
      <p className="text-xs text-muted">Apps made by people who never signed in stay in their own browser and aren&apos;t counted here.</p>
    </div>
  );
}

/** Daily sign-ups, last 14 days: one series, so no legend; hover or focus a bar for its value; a table for screen readers. */
function SignupsChart({ days }: { days: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const W = 700;
  const H = 180;
  const pad = { top: 16, bottom: 26, left: 8, right: 8 };
  const slot = (W - pad.left - pad.right) / days.length;
  const bar = Math.max(6, slot - 8);
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const total = days.reduce((a, d) => a + d.count, 0);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="signups-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="signups-title" className="font-semibold">
          Sign-ups, last 14 days
        </h2>
        <span className="text-sm text-muted tabular-nums">{total.toLocaleString()} total</span>
      </div>
      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label={`Sign-ups per day for the last 14 days, ${total} in total`}>
          <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="currentColor" className="text-white/10" />
          {days.map((d, i) => {
            const h = ((H - pad.top - pad.bottom) * d.count) / max;
            const x = pad.left + i * slot + (slot - bar) / 2;
            return (
              <g key={d.day}>
                {/* Hit target: the whole column, not just the bar. */}
                <rect
                  x={pad.left + i * slot}
                  y={pad.top}
                  width={slot}
                  height={H - pad.top - pad.bottom}
                  fill="transparent"
                  role="img"
                  tabIndex={0}
                  aria-label={`${label(d.day)}: ${d.count} sign-ups`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
                {d.count > 0 && (
                  <path
                    d={`M${x},${H - pad.bottom} v${-(h - 4)} a4,4 0 0 1 4,-4 h${bar - 8} a4,4 0 0 1 4,4 v${h - 4} z`}
                    fill="#8B5CF6"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                    pointerEvents="none"
                  />
                )}
                {(i === 0 || i === days.length - 1 || i % 3 === 0) && (
                  <text x={pad.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-current text-[11px] text-muted">
                    {label(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className={`pointer-events-none absolute whitespace-nowrap rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg ${
              hover >= days.length - 2 ? "-translate-x-full" : hover <= 1 ? "" : "-translate-x-1/2"
            }`}
            style={{ left: `${((pad.left + hover * slot + slot / 2) / W) * 100}%`, top: 0 }}
          >
            <div className="text-muted">{label(days[hover].day)}</div>
            <div className="font-semibold tabular-nums">{days[hover].count} sign-ups</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="inline-flex min-h-8 cursor-pointer items-center">Show as table</summary>
        <table className="mt-2 w-full max-w-xs text-left">
          <thead>
            <tr>
              <th scope="col" className="py-1 font-medium">Day</th>
              <th scope="col" className="py-1 text-right font-medium">Sign-ups</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{label(d.day)}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function MembersTab() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<Member[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (search: string, offset = 0) => {
    const { status, data } = await api<{ members: Member[]; total: number }>(`/api/admin/members?q=${encodeURIComponent(search)}&offset=${offset}`);
    if (status !== 200) return;
    setTotal(data.total);
    setList((prev) => (offset && prev ? [...prev, ...data.members] : data.members));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  const act = async (m: Member, action: "sign-out" | "delete") => {
    if (action === "delete") {
      const typed = prompt(`Delete ${m.email} and all ${m.apps} of their saved apps? This can't be undone.\n\nType the email address to confirm:`);
      if (typed?.trim().toLowerCase() !== m.email) return;
    } else if (!confirm(`Sign ${m.email} out on every device?`)) return;
    setBusy(m.id);
    const { status, data } =
      action === "delete"
        ? await api(`/api/admin/members/${m.id}`, { method: "DELETE" })
        : await api(`/api/admin/members/${m.id}`, { method: "POST", body: JSON.stringify({ action: "sign-out" }) });
    setBusy(null);
    setNote(status === 200 ? (action === "delete" ? `Deleted ${m.email}.` : `Signed ${m.email} out everywhere.`) : data.error || "That didn't work.");
    if (status === 200 && action === "delete") void load(query);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search members by email</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className={`${input} pl-9`} placeholder="Search by email" value={q} onChange={(e) => (setQ(e.target.value), setQuery(e.target.value.trim()))} />
        </label>
        <span className="text-sm text-muted tabular-nums" role="status">
          {total.toLocaleString()} member{total === 1 ? "" : "s"}
        </span>
      </div>
      {note && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          {note}
        </p>
      )}
      {!list ? (
        <Loader2 className="mt-6 h-5 w-5 animate-spin text-muted" aria-label="Loading" />
      ) : list.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">{query ? "No members match that search." : "No members yet."}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Members</caption>
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Email</th>
                <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                <th scope="col" className="px-4 py-3 font-medium">Last active</th>
                <th scope="col" className="px-4 py-3 font-medium">Signs in with</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Apps</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="max-w-[260px] truncate px-4 py-3 font-medium">{m.email}</td>
                  <td className="px-4 py-3 text-muted">{when(m.joinedAt)}</td>
                  <td className="px-4 py-3 text-muted">{when(m.lastActiveAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 text-[11px]">
                      {m.password && <span className="rounded-full bg-surface-2 px-2 py-0.5">Password</span>}
                      {m.google && <span className="rounded-full bg-surface-2 px-2 py-0.5">Google</span>}
                      {m.passkeys > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5">🔑 {m.passkeys} passkey{m.passkeys === 1 ? "" : "s"}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{m.apps}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => act(m, "sign-out")}
                        disabled={busy === m.id}
                        className="min-h-8 rounded-lg px-2 text-xs text-muted hover:bg-white/5 hover:text-foreground"
                        aria-label={`Sign out ${m.email} everywhere`}
                      >
                        Sign out
                      </button>
                      <button
                        onClick={() => act(m, "delete")}
                        disabled={busy === m.id}
                        className="min-h-8 rounded-lg px-2 text-xs text-rose-300 hover:bg-rose-500/10"
                        aria-label={`Delete ${m.email}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list && list.length < total && (
        <button onClick={() => load(query, list.length)} className="mt-4 min-h-9 rounded-lg border border-line px-4 text-sm hover:border-white/20">
          Show more
        </button>
      )}
    </div>
  );
}

function SettingsTab({
  features,
  setFeatures,
  meta,
}: {
  features: Features;
  setFeatures: (f: Features) => void;
  meta: { database: boolean; googleKeys: boolean };
}) {
  const [saving, setSaving] = useState<FeatureKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (key: FeatureKey) => {
    setSaving(key);
    setError(null);
    const { status, data } = await api<{ features: Features }>("/api/admin/features", { method: "PUT", body: JSON.stringify({ key, on: !features[key] }) });
    setSaving(null);
    if (status === 200) setFeatures(data.features);
    else setError(data.error || "Couldn't save that.");
  };
  return (
    <div className="max-w-2xl space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {FEATURE_KEYS.map((key) => {
          const on = features[key];
          const id = `feature-${key}`;
          return (
            <li key={key} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <div id={id} className="text-sm font-medium">
                  {FEATURES[key].label}
                </div>
                <p className="mt-0.5 text-xs text-muted">{FEATURES[key].description}</p>
                {key === "google" && on && !meta.googleKeys && (
                  <p className="mt-1 text-xs text-amber-200">On, but the Google keys aren&apos;t set yet, so the button stays hidden.</p>
                )}
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-labelledby={id}
                disabled={saving === key || !meta.database}
                onClick={() => toggle(key)}
                className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-white/15"} disabled:opacity-50`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        Changes apply within a few seconds, with no redeploy. To change the admin password, edit <code className="font-mono">ADMIN_PASSWORD</code> in Railway →
        Variables and deploy; everyone signed in to admin is signed out.
      </p>
    </div>
  );
}
