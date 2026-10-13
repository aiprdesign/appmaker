"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, BellRing, ChevronDown, Database, Download, Inbox, KeyRound, Loader2, Lock, MessagesSquare, Pencil, Phone, Plus, RefreshCw, Store, Trash2 } from "lucide-react";
import { fieldLabel, isDone } from "@/lib/app-data";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Item {
  id: string;
  createdAt: number;
  status?: string;
  [field: string]: unknown;
}
interface Collection {
  name: string;
  access: "public" | "inbox" | "shared" | "private";
  fields: string[];
  statuses?: string[];
  count: number;
  items: Item[];
}
interface View {
  name: string;
  hasStaffPin: boolean;
  usage?: { month: number; limit: number };
  vapidKey?: string | null;
  collections: Collection[];
}

/** A short two-note chime (no sound file needed). */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // No sound on this browser: the banner and title still show.
  }
}

const urlKey = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const KEY = (id: string) => `appmaker.data-owner.${id}`;
const box = "rounded-2xl border border-line bg-surface p-4 sm:p-5";
const field = "min-h-10 w-full rounded-lg border border-line bg-background px-2 text-sm text-foreground outline-none focus:border-violet-500/60";
const ACCESS = {
  public: { icon: Store, text: "You edit this; everyone using the app sees it." },
  inbox: { icon: Inbox, text: "Sent by customers; only you see all of them. Move each one on and the customer sees where it's at." },
  shared: { icon: MessagesSquare, text: "Added and seen by everyone; you can remove anything." },
  private: { icon: Lock, text: "Each person's own data. Only the number is shown here." },
};

function readKey(id: string): string {
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("k");
  try {
    if (fromLink) localStorage.setItem(KEY(id), fromLink);
    return fromLink ?? localStorage.getItem(KEY(id)) ?? "";
  } catch {
    return fromLink ?? "";
  }
}

/** "orderTotal" → "Order total". */
const label = fieldLabel;
const isPhone = (f: string) => /phone|tel|mobile|whatsapp/i.test(f);
const ORDER = { inbox: 0, shared: 1, public: 2, private: 3 } as const;
const show = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const when = (ms: number) => new Date(ms).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "Just now", "4 min ago", "2 h ago", then the date. */
function ago(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  if (min < 12 * 60) return `${Math.round(min / 60)} h ago`;
  return when(ms);
}

function csv(c: Collection): string {
  const cols = ["createdAt", ...(c.statuses ? ["status"] : []), ...c.fields];
  // Customers wrote these: a leading = + - @ would run as a formula in a spreadsheet, so it's kept as text.
  const cell = (v: unknown) => {
    const t = show(v);
    return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
  };
  return [cols.map((x) => cell(label(x))).join(","), ...c.items.map((i) => cols.map((k) => cell(k === "createdAt" ? new Date(i.createdAt).toISOString() : i[k])).join(","))].join("\n");
}

/**
 * The business's page for its app's data, made for a phone: new orders and
 * requests with their status, the menu or offers it edits, reviews it can
 * remove, and a spreadsheet download of each.
 */
export function DataOwnerPage({ id }: { id: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<{ collection: string; item: Item | null; data: Record<string, string> } | null>(null);
  const [deleting, setDeleting] = useState<{ collection: string; item: Item } | null>(null);
  const [tab, setTab] = useState("");
  const [fresh, setFresh] = useState(0);
  const [alerts, setAlerts] = useState<"off" | "on" | "blocked" | "unsupported">("off");
  const [pin, setPin] = useState("");
  const [pinNote, setPinNote] = useState("");
  const key = useRef("");
  const seen = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [ios, setIos] = useState(false);

  const call = useCallback(
    async (method: "GET" | "POST", body?: unknown) => {
      const res = await fetch(`/api/appdata/${id}/owner`, {
        method,
        cache: "no-store",
        headers: { "content-type": "application/json", ...(key.current ? { "x-owner-key": key.current } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
      return data as View;
    },
    [id],
  );

  const load = useCallback(async () => {
    try {
      const v = await call("GET");
      // New orders and requests since the last look: chime, banner and a count in the tab title.
      const inbox = v.collections.filter((c) => c.access === "inbox").flatMap((c) => c.items.map((i) => i.id));
      if (seen.current) {
        const added = inbox.filter((i) => !seen.current!.has(i));
        if (added.length) {
          setFresh((n) => n + added.length);
          setFreshIds((f) => [...f, ...added]);
          chime();
        }
      }
      seen.current = new Set(inbox);
      v.collections.sort((a, b) => ORDER[a.access] - ORDER[b.access]);
      setView(v);
      setTab((t) => t || v.collections[0]?.name || "");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [call]);

  useEffect(() => {
    key.current = readKey(id);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    const first = setTimeout(load, 0);
    // New orders and requests show up without reloading: every 30 seconds while the page is in view,
    // nothing while it's hidden (alerts cover that), and at once when it's back.
    let t = setInterval(load, 30_000);
    const onVisible = () => {
      clearInterval(t);
      if (document.visibilityState === "visible") {
        void load();
        t = setInterval(load, 30_000);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [id, load]);

  useEffect(() => {
    const base = view?.name ? `${view.name}: app data` : "App data";
    document.title = fresh ? `(${fresh}) New · ${base}` : base;
  }, [fresh, view?.name]);

  useEffect(() => {
    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const t = setTimeout(() => {
      setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as unknown as { standalone?: boolean }).standalone);
      if (!supported) setAlerts("unsupported");
      else if (Notification.permission === "denied") setAlerts("blocked");
      else
        void navigator.serviceWorker.getRegistration("/owner-sw.js").then(async (r) => {
          if (r && (await r.pushManager.getSubscription())) setAlerts("on");
        });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /** Alerts on this device, even when the page is closed (web push). */
  const turnOnAlerts = async () => {
    setBusy("alerts");
    try {
      chime(); // also lets the browser play the chime later
      if (alerts === "unsupported" || !view?.vapidKey) throw new Error("This browser can't show alerts. On iPhone, add this page to your Home Screen first (Share → Add to Home Screen), then open it from there.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setAlerts("blocked");
        throw new Error("Alerts are blocked for this page. Allow notifications in your browser's settings for this site.");
      }
      const reg = await navigator.serviceWorker.register("/owner-sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(view.vapidKey) }));
      await call("POST", { action: "alerts-web", subscription: sub.toJSON() });
      setAlerts("on");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const savePin = async (next: string) => {
    setBusy("pin");
    try {
      const v = await call("POST", { action: "set-pin", pin: next });
      setView((old) => (old ? { ...old, hasStaffPin: v.hasStaffPin } : old));
      setPin("");
      setPinNote(next ? "Staff PIN saved. Staff open Staff mode in the app and enter it." : "Staff PIN removed: staff mode is closed.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const act = async (body: Record<string, unknown>, what: string) => {
    setBusy(what);
    try {
      const v = await call("POST", body);
      v.collections.sort((a, b) => ORDER[a.access] - ORDER[b.access]);
      setView(v);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy("");
    }
  };

  if (!view) {
    return (
      <main id="main" className="mx-auto grid min-h-dvh max-w-3xl place-items-center p-6 text-center">
        {error ? <p role="alert" className="text-amber-200">{error}</p> : <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading" />}
      </main>
    );
  }
  const current = view.collections.find((c) => c.name === tab) ?? view.collections[0];
  const inbox = current?.access === "inbox" ? current : null;
  const active = inbox ? inbox.items.filter((i) => !isDone(i.status, inbox.statuses)).sort((a, b) => a.createdAt - b.createdAt) : [];
  const done = inbox ? inbox.items.filter((i) => isDone(i.status, inbox.statuses)) : [];
  const seenNew = () => {
    setFresh(0);
    const first = freshIds[0];
    if (first) document.getElementById(`item-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /** One item: its fields (phone numbers can be called), how long ago, and for orders the next step. */
  const row = (c: Collection, item: Item) => {
    const statuses = c.statuses ?? [];
    const at = Math.max(0, statuses.indexOf(item.status ?? ""));
    const next = c.statuses && !isDone(item.status, statuses) ? statuses.slice(at + 1).find((x) => !/^(cancel|declin|reject)/i.test(x)) : undefined;
    const isNew = freshIds.includes(item.id);
    const waiting = c.statuses && item.status === statuses[0];
    return (
      <li key={item.id} id={`item-${item.id}`} className={`flex flex-wrap items-start gap-3 py-3 ${waiting ? "border-l-4 border-violet-400 pl-3" : ""} ${isNew ? "rounded-lg ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-transparent" : ""}`}>
        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
          {c.fields
            .filter((f) => show(item[f]))
            .map((f, i) =>
              i === 0 ? (
                <div key={f} className="flex items-center gap-2 font-medium">
                  <span className="break-words">{show(item[f])}</span>
                  {isNew && <span className="rounded-full bg-emerald-400 px-2 text-xs font-semibold text-black">New</span>}
                </div>
              ) : isPhone(f) ? (
                <a key={f} href={`tel:${show(item[f]).replace(/[^\d+]/g, "")}`} className="inline-flex min-h-8 items-center gap-1.5 text-violet-200 underline underline-offset-2">
                  <Phone className="h-3.5 w-3.5" aria-hidden /> {show(item[f])}
                </a>
              ) : (
                <div key={f}>
                  <span className="text-muted">{label(f)}: </span>
                  <span className="break-words">{show(item[f])}</span>
                </div>
              ),
            )}
          <div className="text-xs text-muted">
            {item.ref ? `#${String(item.ref)} · ` : ""}
            <time dateTime={new Date(item.createdAt).toISOString()} title={when(item.createdAt)}>
              {ago(item.createdAt)}
            </time>
          </div>
        </div>
        {c.statuses ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-end">
            {next && (
              <button
                disabled={!!busy}
                onClick={() => void act({ action: "status", collection: c.name, id: item.id, status: next }, item.id)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50"
              >
                Mark as {label(next).toLowerCase()} <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-muted">
              <span>Status</span>
              <select
                value={item.status ?? ""}
                disabled={!!busy}
                onChange={(e) => void act({ action: "status", collection: c.name, id: item.id, status: e.target.value }, item.id)}
                className={`${field} min-h-9 w-auto`}
              >
                {c.statuses.map((x) => (
                  <option key={x} value={x}>
                    {label(x)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {/* Orders and requests are kept while active; finished ones can be cleared from the Done list. */}
        {(!c.statuses || isDone(item.status, statuses)) && (
          <div className="flex gap-1">
            {c.access === "public" && (
              <button
                onClick={() => setEditing({ collection: c.name, item, data: Object.fromEntries(c.fields.map((f) => [f, show(item[f])])) })}
                aria-label={`Edit ${show(item[c.fields[0]]) || "item"}`}
                className="grid h-10 w-10 place-items-center rounded-lg border border-line hover:border-white/20"
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            )}
            <button
              onClick={() => setDeleting({ collection: c.name, item })}
              aria-label={`Delete ${show(item[c.fields[0]]) || "item"}`}
              className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-4 p-4 pb-32 sm:p-6">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
          <Database className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{view.name || "Your app"}</h1>
        {alerts === "off" && (
          <button onClick={() => void turnOnAlerts()} disabled={!!busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 text-sm font-medium text-black disabled:opacity-50">
            {busy === "alerts" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />} Alerts
          </button>
        )}
        <button onClick={() => void load()} aria-label="Refresh" className="grid h-10 w-10 place-items-center rounded-lg border border-line hover:border-white/20">
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      </header>
      {error && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{error}</p>}
      {fresh > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 p-3 text-sm font-medium text-emerald-200">
          <BellRing className="h-4 w-4" aria-hidden /> {fresh} new since you last looked
          <button onClick={seenNew} className="ml-auto min-h-8 rounded-lg border border-emerald-400/40 px-3 text-xs">
            Show
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Your app's data" className="flex flex-wrap gap-2">
        {view.collections.map((c) => {
          const waiting = c.statuses ? c.items.filter((i) => i.status === c.statuses![0]).length : 0;
          return (
            <button
              key={c.name}
              role="tab"
              aria-selected={c.name === current?.name}
              onClick={() => setTab(c.name)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm ${c.name === current?.name ? "border-violet-400 bg-violet-500/15 font-medium" : "border-line hover:border-white/20"}`}
            >
              {label(c.name)}
              <span className={`rounded-full px-2 text-xs ${waiting ? "bg-violet-400 font-semibold text-black" : "bg-white/10"}`}>{waiting ? `${waiting} waiting` : c.count}</span>
            </button>
          );
        })}
      </div>

      {current && (
        <section aria-labelledby="collection-title" className={box}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="collection-title" className="mr-auto text-lg font-semibold">
              {label(current.name)}
            </h2>
            {current.access !== "private" && current.items.length > 0 && (
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv(current))}`}
                download={`${current.name}.csv`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20"
              >
                <Download className="h-4 w-4" aria-hidden /> Spreadsheet
              </a>
            )}
            {current.access !== "private" && (
              <button
                onClick={() => setEditing({ collection: current.name, item: null, data: Object.fromEntries(current.fields.map((f) => [f, ""])) })}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20"
              >
                <Plus className="h-4 w-4" aria-hidden /> {current.access === "inbox" ? `Add a phone ${label(current.name).toLowerCase().replace(/s$/, "")}` : "Add"}
              </button>
            )}
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
            {(() => {
              const Icon = ACCESS[current.access].icon;
              return <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />;
            })()}
            {ACCESS[current.access].text}
          </p>

          {current.access === "private" ? (
            <p className="mt-4 text-sm text-muted">{current.count} saved by people using the app.</p>
          ) : inbox ? (
            <>
              {active.length === 0 ? (
                <p className="mt-6 text-center text-sm text-muted">
                  All caught up. New {label(current.name).toLowerCase()} appear here{alerts === "on" ? ", and this device alerts you" : ""}.
                </p>
              ) : (
                <ul aria-label={`Waiting and in progress (${active.length}), oldest first`} className="mt-4 divide-y divide-line">
                  {active.map((item) => row(current, item))}
                </ul>
              )}
              {done.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <button onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
                    Done ({done.length}) <ChevronDown className={`h-4 w-4 transition ${showDone ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {showDone && <ul className="divide-y divide-line opacity-80">{done.map((item) => row(current, item))}</ul>}
                </div>
              )}
            </>
          ) : current.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nothing here yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">{current.items.map((item) => row(current, item))}</ul>
          )}
        </section>
      )}

      {editing && (
        <form
          aria-labelledby="edit-title"
          className={box}
          onSubmit={async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(Object.entries(editing.data).filter(([, v]) => v.trim() !== ""));
            const ok = await act(editing.item ? { action: "update", collection: editing.collection, id: editing.item.id, data } : { action: "add", collection: editing.collection, data }, "save");
            if (ok) setEditing(null);
          }}
        >
          <h2 id="edit-title" className="text-lg font-semibold">
            {editing.item ? "Edit" : "Add to"} {label(editing.collection)}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {Object.keys(editing.data).map((f) => (
              <label key={f} className="space-y-1 text-sm">
                <span>{label(f)}</span>
                <input value={editing.data[f]} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, [f]: e.target.value } })} className={field} />
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={!!busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-50">
              {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save
            </button>
            <button type="button" onClick={() => setEditing(null)} className="min-h-10 rounded-lg border border-line px-4 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this item?"
          body="It's removed from the app for everyone. This can't be undone."
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await act({ action: "delete", collection: deleting.collection, id: deleting.item.id }, "delete");
            setDeleting(null);
          }}
        />
      )}
      {view.usage && (
        <p className={`px-1 text-xs ${view.usage.month >= view.usage.limit * 0.8 ? "text-amber-200" : "text-muted"}`}>
          This month: {view.usage.month.toLocaleString()} of {view.usage.limit.toLocaleString()} new orders, requests and posts
          {view.usage.month >= view.usage.limit ? ". The limit is reached: customers can't send more until next month." : view.usage.month >= view.usage.limit * 0.8 ? ". Close to this month's limit." : "."}
        </p>
      )}
      <p className="px-1 text-xs leading-relaxed text-muted">
        Your customers&apos; details are for handling their orders and requests only. Spreadsheets you download contain personal information: keep them private and delete them when you&apos;re done.
        Finished orders and requests are deleted automatically after 90 days (any after a year), and customers can delete their own data in the app.
      </p>
      <details className={`${box} group`}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 font-semibold">
          <Bell className="h-4 w-4" aria-hidden /> Alerts and staff PIN
          <span className="ml-auto text-xs font-normal text-muted">{alerts === "on" ? "Alerts on" : "Alerts off"} · {view.hasStaffPin ? "PIN set" : "No PIN"}</span>
          <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 text-sm">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <Bell className="h-4 w-4" aria-hidden /> Alerts on this device
          </h2>
          {alerts === "on" ? (
            <p className="text-emerald-300">On: you&apos;ll get an alert for every new order or request, even with this page closed.</p>
          ) : alerts === "blocked" ? (
            <p className="text-amber-200">Alerts are blocked for this page. Allow notifications for this site in your browser settings, then reload. While the page is open, a chime still plays.</p>
          ) : alerts === "unsupported" ? (
            <p className="text-muted">
              {ios ? "On iPhone and iPad, add this page to your Home Screen (Share → Add to Home Screen) and open it from there to get alerts." : "This browser can't show alerts. While the page is open, a chime plays for new orders."}
            </p>
          ) : (
            <>
              <p className="text-muted">Get an alert for every new order or request, even when this page is closed. While it&apos;s open, a chime plays.</p>
              {ios && <p className="text-muted">On iPhone and iPad, add this page to your Home Screen first (Share → Add to Home Screen).</p>}
              <button onClick={() => void turnOnAlerts()} disabled={!!busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 font-medium text-black disabled:opacity-50">
                {busy === "alerts" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />} Turn on alerts
              </button>
            </>
          )}
        </div>
        <form
          className="space-y-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void savePin(pin);
          }}
        >
          <h2 className="flex items-center gap-1.5 font-semibold">
            <KeyRound className="h-4 w-4" aria-hidden /> Staff mode in the app
          </h2>
          <p className="text-muted">
            {view.hasStaffPin ? "A staff PIN is set." : "Set a PIN so staff can manage orders in the app itself and get alerts on their phone."} Open Staff in the app&apos;s settings and enter it.
          </p>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="staff-pin">Staff PIN (6 to 8 digits)</label>
            <input id="staff-pin" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6,8}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="6–8 digits" className={`${field} max-w-40`} />
            <button disabled={!!busy || pin.length < 6} className="min-h-10 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-50">
              {view.hasStaffPin ? "Change" : "Set PIN"}
            </button>
            {view.hasStaffPin && (
              <button type="button" onClick={() => void savePin("")} disabled={!!busy} className="min-h-10 rounded-lg border border-line px-3">
                Remove
              </button>
            )}
          </div>
          {pinNote && <p role="status" className="text-emerald-300">{pinNote}</p>}
        </form>
        </div>
      </details>
    </main>
  );
}
