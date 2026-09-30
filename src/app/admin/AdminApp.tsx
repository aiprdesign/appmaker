"use client";

import { useCallback, useEffect, useState } from "react";
import { AppWindow, BarChart3, Check, CircleAlert, Coins, CreditCard, Eye, EyeOff, KeyRound, Loader2, LogOut, Search, Settings, ShieldCheck, Trash2, Users } from "lucide-react";
import { formatPrice, type CreditPack } from "@/lib/credits";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FEATURES, FEATURE_KEYS, type FeatureKey, type Features } from "@/lib/features";
import type { Prices } from "@/lib/credits";
import { AppsTab } from "./AppsTab";

type Tab = "overview" | "members" | "apps" | "settings";

const TABS: { key: Tab; icon: typeof Users }[] = [
  { key: "overview", icon: BarChart3 },
  { key: "members", icon: Users },
  { key: "apps", icon: AppWindow },
  { key: "settings", icon: Settings },
];

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
  credits: number | null;
  paid: boolean;
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
  const [appsOf, setAppsOf] = useState<{ id: string; email: string } | null>(null);

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
      <div
        role="tablist"
        aria-label="Admin sections"
        className="scrollbar-thin mt-6 flex gap-1 overflow-x-auto border-b border-line"
        onKeyDown={(e) => {
          // Arrow keys move between tabs, as screen reader users expect.
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const i = TABS.findIndex((t) => t.key === tab);
          const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].key;
          setTab(next);
          (e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus();
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            data-tab={t.key}
            role="tab"
            aria-selected={tab === t.key}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm capitalize ${
              tab === t.key ? "border-violet-400 font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" /> {t.key}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "overview" && (meta.database ? <OverviewTab /> : null)}
        {tab === "members" &&
          (meta.database ? (
            <MembersTab
              showApps={(m) => {
                setAppsOf(m);
                setTab("apps");
              }}
            />
          ) : null)}
        {tab === "apps" && (meta.database ? <AppsTab member={appsOf} clearMember={() => setAppsOf(null)} /> : null)}
        {tab === "settings" && features && <SettingsTab features={features} setFeatures={setFeatures} meta={meta} />}
      </div>
    </div>
  );
}

function AdminLogin({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
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
        <div className="relative">
          <input
            className={`${input} pr-11`}
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-foreground"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
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
        <Stat label="Passkey users" value={data.withPasskeys} sub={`and ${data.withGoogle.toLocaleString()} sign in with Google`} />
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
  const pad = { top: 16, bottom: 4, left: 8, right: 8 };
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
              </g>
            );
          })}
        </svg>
        {/* Dates as text under the chart, so they stay readable at any width. */}
        <div className="mt-2 flex justify-between text-xs text-muted" aria-hidden="true">
          {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
            <span key={i}>{days[i] ? label(days[i].day) : ""}</span>
          ))}
        </div>
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

function MembersTab({ showApps }: { showApps: (m: { id: string; email: string }) => void }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<Member[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<{ member: Member; action: "sign-out" | "delete" } | null>(null);
  const [giving, setGiving] = useState<Member | null>(null);
  const [amount, setAmount] = useState("25");
  const [paid, setPaid] = useState(false);

  const give = async (m: Member) => {
    const n = Number(amount);
    setGiving(null);
    const done: string[] = [];
    if (paid !== m.paid) {
      const { status, data } = await api(`/api/admin/members/${m.id}`, { method: "POST", body: JSON.stringify({ action: "plan", paid }) });
      if (status !== 200) return setNote({ ok: false, text: data.error || "That didn't work." });
      setList((prev) => prev?.map((x) => (x.id === m.id ? { ...x, paid } : x)) ?? prev);
      done.push(paid ? `Gave ${m.email} the paid plan.` : `Moved ${m.email} to the free plan.`);
    }
    if (n) {
      const { status, data } = await api<{ balance: number }>(`/api/admin/members/${m.id}`, { method: "POST", body: JSON.stringify({ action: "credits", amount: n }) });
      if (status !== 200) return setNote({ ok: false, text: data.error || "That didn't work." });
      done.push(`${n > 0 ? "Gave" : "Removed"} ${Math.abs(n)} credits ${n > 0 ? "to" : "from"} ${m.email}. Balance: ${data.balance}.`);
      setList((prev) => prev?.map((x) => (x.id === m.id ? { ...x, credits: data.balance } : x)) ?? prev);
    }
    if (done.length) setNote({ ok: true, text: done.join(" ") });
  };

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
    setBusy(m.id);
    const { status, data } =
      action === "delete"
        ? await api(`/api/admin/members/${m.id}`, { method: "DELETE" })
        : await api(`/api/admin/members/${m.id}`, { method: "POST", body: JSON.stringify({ action: "sign-out" }) });
    setBusy(null);
    setConfirming(null);
    setNote(
      status === 200
        ? { ok: true, text: action === "delete" ? `Deleted ${m.email}.` : `Signed ${m.email} out everywhere.` }
        : { ok: false, text: data.error || "That didn't work." },
    );
    if (status === 200 && action === "delete") void load(query);
  };

  const methods = (m: Member) => (
    <div className="flex flex-wrap gap-1 text-[11px]">
      {m.paid && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300">Paid</span>}
      {m.password && <span className="rounded-full bg-surface-2 px-2 py-0.5">Password</span>}
      {m.google && <span className="rounded-full bg-surface-2 px-2 py-0.5">Google</span>}
      {m.passkeys > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">
          <KeyRound className="h-3 w-3" /> {m.passkeys} passkey{m.passkeys === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
  const appsButton = (m: Member) =>
    m.apps > 0 ? (
      <button
        onClick={() => showApps({ id: m.id, email: m.email })}
        className="inline-flex min-h-8 items-center gap-1 rounded-full bg-violet-500/15 px-3 text-xs font-medium text-violet-200 hover:bg-violet-500/25"
        aria-label={`Show ${m.email}'s ${m.apps} apps`}
      >
        <AppWindow className="h-3.5 w-3.5" /> {m.apps} app{m.apps === 1 ? "" : "s"}
      </button>
    ) : (
      <span className="text-xs text-muted">No apps</span>
    );
  const actions = (m: Member) => (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        onClick={() => {
          setAmount("25");
          setPaid(m.paid);
          setGiving(m);
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-muted hover:border-white/20 hover:text-foreground"
        aria-label={`Give credits to ${m.email}`}
      >
        <Coins className="h-3.5 w-3.5" /> {m.credits ?? "—"}
      </button>
      <button
        onClick={() => setConfirming({ member: m, action: "sign-out" })}
        disabled={busy === m.id}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-muted hover:border-white/20 hover:text-foreground"
        aria-label={`Sign out ${m.email} everywhere`}
      >
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </button>
      <button
        onClick={() => setConfirming({ member: m, action: "delete" })}
        disabled={busy === m.id}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-500/30 px-2.5 text-xs text-rose-300 hover:bg-rose-500/10"
        aria-label={`Delete ${m.email}`}
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>
    </div>
  );

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
        <p role="status" className={`mt-3 flex items-center gap-1.5 text-sm ${note.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {note.ok && <Check className="h-4 w-4" />} {note.text}
        </p>
      )}
      {!list ? (
        <Loader2 className="mt-6 h-5 w-5 animate-spin text-muted" aria-label="Loading" />
      ) : list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm text-muted">{query ? "No members match that search." : "No members yet. They appear here when people create accounts."}</p>
        </div>
      ) : (
        <>
          {/* Phones: one card per member. */}
          <ul className="mt-4 space-y-3 md:hidden" aria-label="Members">
            {list.map((m) => (
              <li key={m.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="truncate font-medium">{m.email}</div>
                <div className="mt-1 text-xs text-muted">
                  Joined {when(m.joinedAt)} · active {when(m.lastActiveAt)}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {methods(m)}
                  {appsButton(m)}
                </div>
                <div className="mt-3 border-t border-line pt-3">{actions(m)}</div>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-line md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Members</caption>
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Email</th>
                  <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last active</th>
                  <th scope="col" className="px-4 py-3 font-medium">Signs in with</th>
                  <th scope="col" className="px-4 py-3 font-medium">Apps</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="border-t border-line hover:bg-white/[0.02]">
                    <td className="max-w-[260px] truncate px-4 py-3 font-medium">{m.email}</td>
                    <td className="px-4 py-3 text-muted">{when(m.joinedAt)}</td>
                    <td className="px-4 py-3 text-muted">{when(m.lastActiveAt)}</td>
                    <td className="px-4 py-3">{methods(m)}</td>
                    <td className="px-4 py-3">{appsButton(m)}</td>
                    <td className="px-4 py-3">{actions(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {list && list.length < total && (
        <button onClick={() => load(query, list.length)} className="mt-4 min-h-9 rounded-lg border border-line px-4 text-sm hover:border-white/20">
          Show more
        </button>
      )}
      {giving && (
        <ConfirmDialog
          title="Credits and plan"
          body={
            <div className="space-y-3">
              <p>
                <span className="text-foreground">{giving.email}</span> has {giving.credits ?? "no"} credits. Use a negative number to remove some.
              </p>
              <label className="block text-xs">
                Credits
                <input
                  type="number"
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-violet-500/60"
                />
              </label>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-violet-500" />
                Paid plan (store builds, bookings, live updates, no Made with Appmaker line)
              </label>
            </div>
          }
          confirmLabel={Number(amount) < 0 ? "Remove credits" : "Save"}
          onConfirm={() => give(giving)}
          onCancel={() => setGiving(null)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          danger={confirming.action === "delete"}
          title={confirming.action === "delete" ? "Delete this member?" : "Sign out everywhere?"}
          body={
            confirming.action === "delete" ? (
              <>
                <span className="text-foreground">{confirming.member.email}</span> and all {confirming.member.apps} of their saved apps will be deleted. This can&apos;t be
                undone.
              </>
            ) : (
              <>
                <span className="text-foreground">{confirming.member.email}</span> will be signed out on every device. Their apps stay in their account.
              </>
            )
          }
          confirmLabel={confirming.action === "delete" ? "Delete member" : "Sign out everywhere"}
          typeToConfirm={confirming.action === "delete" ? confirming.member.email : undefined}
          onConfirm={() => act(confirming.member, confirming.action)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

const SETTING_GROUPS: { title: string; keys: FeatureKey[] }[] = [
  { title: "Sign-in", keys: ["signups", "passkeys", "google"] },
  { title: "Building apps", keys: ["websiteImport", "bookings", "cloudBuilds"] },
  { title: "Site", keys: ["publicStatus"] },
];

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
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (key: FeatureKey) => {
    setSaving(key);
    setError(null);
    setSaved(null);
    const on = !features[key];
    const { status, data } = await api<{ features: Features }>("/api/admin/features", { method: "PUT", body: JSON.stringify({ key, on }) });
    setSaving(null);
    if (status === 200) {
      setFeatures(data.features);
      setSaved(`${FEATURES[key].label} turned ${on ? "on" : "off"}. Saved.`);
    } else setError(data.error || "Couldn't save that.");
  };
  const grouped = new Set(SETTING_GROUPS.flatMap((g) => g.keys));
  const groups = [...SETTING_GROUPS, { title: "Other", keys: FEATURE_KEYS.filter((k) => !grouped.has(k)) }].filter((g) => g.keys.length);
  return (
    <div className="max-w-2xl space-y-6">
      <PaymentsSection />
      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      <p role="status" className={`flex min-h-5 items-center gap-1.5 text-sm text-emerald-300 ${saved ? "" : "invisible"}`}>
        <Check className="h-4 w-4" /> {saved ?? "Saved"}
      </p>
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`group-${g.title}`}>
          <h2 id={`group-${g.title}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {g.title}
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {g.keys.map((key) => {
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
                    aria-busy={saving === key}
                    disabled={saving === key || !meta.database}
                    onClick={() => toggle(key)}
                    className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-white/15"} disabled:opacity-60`}
                  >
                    <span className={`absolute top-1 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`}>
                      {saving === key && <Loader2 className="h-3 w-3 animate-spin text-neutral-500" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted">
        Changes apply within a few seconds, with no redeploy. To change the admin password, edit <code className="font-mono">ADMIN_PASSWORD</code> in Railway →
        Variables and deploy; everyone signed in to admin is signed out.
      </p>
    </div>
  );
}

interface Payments {
  enabled: boolean;
  stripeKey: boolean;
  webhook: boolean;
  database: boolean;
  mode: "test" | "live" | null;
  currency: string;
  packs: CreditPack[];
  prices: Prices;
  webhookUrl: string;
  stats: { purchases: number; creditsSold: number; creditsSpent: number; paidMembers: number } | null;
}

/** Stripe setup checklist: what's done, what's missing, and exactly where to set it. */
const PRICE_FIELDS: { key: keyof Prices; label: string; hint: string }[] = [
  { key: "newApp", label: "New app", hint: "credits" },
  { key: "edit", label: "Change to an app", hint: "credits" },
  { key: "build", label: "Store build", hint: "credits" },
  { key: "phonePreview", label: "Phone preview", hint: "credits" },
  { key: "freeCredits", label: "Free credits each month", hint: "per free account" },
  { key: "guestBuilds", label: "Builds without an account", hint: "per day" },
];

function PaymentsSection() {
  const [p, setP] = useState<Payments | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api<Payments>("/api/admin/payments").then(({ status, data }) => {
      if (status !== 200) return;
      setP(data);
      setDraft(Object.fromEntries(Object.entries(data.prices).map(([k, v]) => [k, String(v)])));
    });
  }, []);
  if (!p) return null;
  const savePrices = async () => {
    const { status, data } = await api<{ prices: Prices }>("/api/admin/payments", {
      method: "POST",
      body: JSON.stringify({ prices: Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])) }),
    });
    if (status !== 200) return setSaved({ ok: false, text: data.error || "Couldn't save the prices." });
    setP({ ...p, prices: data.prices });
    setDraft(Object.fromEntries(Object.entries(data.prices).map(([k, v]) => [k, String(v)])));
    setSaved({ ok: true, text: "Saved. New prices apply within a minute." });
  };
  const cheapest = [...p.packs].sort((a, b) => a.price / a.credits - b.price / b.credits)[0];
  const steps = [
    { ok: p.database, label: "Database connected", hint: "Balances are kept in the database (DATABASE_URL)." },
    { ok: p.stripeKey, label: "Stripe secret key", hint: "Stripe → Developers → API keys → Secret key. Add it as STRIPE_SECRET_KEY in Railway → Variables." },
    {
      ok: p.webhook,
      label: "Stripe webhook",
      hint: `Stripe → Developers → Webhooks → Add endpoint: ${p.webhookUrl}, event checkout.session.completed. Copy its signing secret into STRIPE_WEBHOOK_SECRET.`,
    },
  ];
  return (
    <section aria-labelledby="payments-title" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payments-title" className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4 text-violet-300" /> Payments (Stripe)
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.enabled ? (p.mode === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200") : "bg-white/10 text-muted"}`}
        >
          {p.enabled ? (p.mode === "live" ? "Live — taking real payments" : "Test mode") : "Off — everything is free"}
        </span>
      </div>
      <ul className="mt-4 space-y-3">
        {steps.map((s) => (
          <li key={s.label} className="flex items-start gap-2 text-sm">
            {s.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
            <div className="min-w-0">
              <div className={s.ok ? "" : "font-medium"}>{s.label}</div>
              {!s.ok && <p className="mt-0.5 break-words text-xs text-muted">{s.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
      {p.enabled && !p.webhook && <p className="mt-3 text-xs text-amber-200">Without the webhook, credits are still added when buyers return from Stripe, but a buyer who closes the tab early would wait for support.</p>}
      <div className="mt-4 grid gap-3 text-xs text-muted sm:grid-cols-2">
        <div>
          <div className="font-medium text-foreground">Credit packs</div>
          <ul className="mt-1 space-y-0.5">
            {p.packs.map((pack) => (
              <li key={pack.id}>
                {pack.name}: {pack.credits} credits for {formatPrice(pack.price, p.currency)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Prices and free allowances</legend>
        <p className="mt-0.5 text-xs text-muted">
          Check your AI and Expo bills now and then: a credit sells for about {cheapest ? formatPrice(Math.round(cheapest.price / cheapest.credits), p.currency) : "—"} in
          the biggest pack, so each thing should cost you less than its credits bring in. Automatic fixes after a build are free (a few per build).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PRICE_FIELDS.map((f) => (
            <label key={f.key} className="grid gap-1 text-xs text-muted">
              <span className="font-medium text-foreground">{f.label}</span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  className="min-h-9 w-20 rounded-lg border border-line bg-surface-2 px-2 text-sm text-foreground outline-none focus:border-violet-500/60"
                />
                {f.hint}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={savePrices} className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-sm font-medium text-black">
            Save prices
          </button>
          {saved && (
            <span role="status" className={`text-xs ${saved.ok ? "text-emerald-300" : "text-amber-200"}`}>
              {saved.text}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Buying any pack gives the paid plan for good (store builds, bookings, live updates, no Made with Appmaker line); you can also give it to a member in Members.
        </p>
      </fieldset>
      {p.stats && p.enabled && (
        <p className="mt-4 text-sm">
          {p.stats.paidMembers.toLocaleString()} paid members · {p.stats.purchases.toLocaleString()} purchases · {p.stats.creditsSold.toLocaleString()} credits sold · {p.stats.creditsSpent.toLocaleString()} credits used
        </p>
      )}
      <p className="mt-4 text-xs text-muted">
        Optional variables: APPMAKER_CREDIT_PACKS (JSON list of packs), APPMAKER_CURRENCY (default usd), APPMAKER_FREE_CREDITS (default 10) and APPMAKER_GUEST_BUILDS
        (default 1) set the starting values; the prices above override them. Use test keys first; switch to live keys when you&apos;re ready.
      </p>
    </section>
  );
}
