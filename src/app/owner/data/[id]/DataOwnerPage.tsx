"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Download, Inbox, Loader2, Lock, MessagesSquare, Pencil, Plus, RefreshCw, Store, Trash2 } from "lucide-react";
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
  collections: Collection[];
}

const KEY = (id: string) => `appmaker.data-owner.${id}`;
const box = "rounded-2xl border border-line bg-surface p-4 sm:p-5";
const field = "min-h-10 w-full rounded-lg border border-line bg-background px-2 text-sm text-foreground outline-none focus:border-violet-500/60";
const ACCESS = {
  public: { icon: Store, text: "You edit this; everyone using the app sees it." },
  inbox: { icon: Inbox, text: "Sent by customers; only you see all of them. Set the status to keep them updated." },
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
const label = (f: string) => f.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (m) => m.toLowerCase());
const show = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const when = (ms: number) => new Date(ms).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function csv(c: Collection): string {
  const cols = ["createdAt", ...(c.statuses ? ["status"] : []), ...c.fields];
  const cell = (v: unknown) => `"${show(v).replace(/"/g, '""')}"`;
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
  const key = useRef("");

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
      setView(v);
      setTab((t) => t || v.collections.find((c) => c.access === "inbox")?.name || v.collections[0]?.name || "");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [call]);

  useEffect(() => {
    key.current = readKey(id);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    const first = setTimeout(load, 0);
    // New orders and requests show up without reloading.
    const t = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [id, load]);

  const act = async (body: Record<string, unknown>, what: string) => {
    setBusy(what);
    try {
      setView(await call("POST", body));
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

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-4 p-4 pb-16 sm:p-6">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
          <Database className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{view.name || "Your app"}: app data</h1>
          <p className="text-sm text-muted">Everything your app&apos;s customers send, and what they see. Keep this link private.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20">
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </button>
      </header>
      {error && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{error}</p>}

      <div role="tablist" aria-label="Your app's data" className="flex flex-wrap gap-2">
        {view.collections.map((c) => (
          <button
            key={c.name}
            role="tab"
            aria-selected={c.name === current?.name}
            onClick={() => setTab(c.name)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm ${c.name === current?.name ? "border-violet-400 bg-violet-500/15 font-medium" : "border-line hover:border-white/20"}`}
          >
            {label(c.name)}
            <span className="rounded-full bg-white/10 px-2 text-xs">{c.count}</span>
          </button>
        ))}
      </div>

      {current && (
        <section aria-labelledby="collection-title" className={box}>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 id="collection-title" className="text-lg font-semibold">{label(current.name)}</h2>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                {(() => {
                  const Icon = ACCESS[current.access].icon;
                  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
                })()}
                {ACCESS[current.access].text}
              </p>
            </div>
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
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black"
              >
                <Plus className="h-4 w-4" aria-hidden /> Add
              </button>
            )}
          </div>

          {current.access === "private" ? (
            <p className="mt-4 text-sm text-muted">{current.count} saved by people using the app.</p>
          ) : current.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nothing here yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {current.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start gap-3 py-3">
                  <dl className="min-w-0 flex-1 space-y-0.5 text-sm">
                    {current.fields
                      .filter((f) => show(item[f]))
                      .map((f, i) => (
                        <div key={f} className={i === 0 ? "font-medium" : "text-muted"}>
                          {i > 0 && <dt className="inline">{label(f)}: </dt>}
                          <dd className="inline break-words">{show(item[f])}</dd>
                        </div>
                      ))}
                    <div className="text-xs text-muted">{when(item.createdAt)}</div>
                  </dl>
                  {current.statuses && (
                    <label className="flex items-center gap-2 text-sm">
                      <span className="sr-only">Status</span>
                      <select
                        value={item.status ?? ""}
                        disabled={!!busy}
                        onChange={(e) => void act({ action: "status", collection: current.name, id: item.id, status: e.target.value }, item.id)}
                        className={`${field} w-auto ${item.status === current.statuses[0] ? "border-violet-400 font-medium" : ""}`}
                      >
                        {current.statuses.map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex gap-1">
                    {current.access === "public" && (
                      <button
                        onClick={() => setEditing({ collection: current.name, item, data: Object.fromEntries(current.fields.map((f) => [f, show(item[f])])) })}
                        aria-label={`Edit ${show(item[current.fields[0]]) || "item"}`}
                        className="grid h-10 w-10 place-items-center rounded-lg border border-line hover:border-white/20"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleting({ collection: current.name, item })}
                      aria-label={`Delete ${show(item[current.fields[0]]) || "item"}`}
                      className="grid h-10 w-10 place-items-center rounded-lg border border-line text-red-300 hover:border-red-400/40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
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
    </main>
  );
}
