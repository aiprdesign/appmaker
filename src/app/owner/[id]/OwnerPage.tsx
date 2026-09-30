"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarOff, CalendarPlus, Check, Clock, Copy, Loader2, MessageCircle, Phone, RefreshCw, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HoursEditor } from "@/components/HoursEditor";
import type { BookingSettings } from "@/lib/booking";

interface Booking {
  id: string;
  start: string;
  label: string;
  name: string;
  phone: string;
  service: string;
  note: string;
  createdAt: string;
  isNew: boolean;
}
interface Block {
  id: string;
  label: string;
  note: string;
}
interface View {
  name: string;
  settings: BookingSettings;
  bookings: Booking[];
  blocks: Block[];
  calendarUrl: string;
  ownerUrl?: string;
}

const KEY = (id: string) => `appmaker.owner.${id}`;
const box = "rounded-2xl border border-line bg-surface p-4 sm:p-5";
const field = "min-h-10 rounded-lg border border-line bg-background px-2 text-sm text-foreground outline-none focus:border-violet-500/60";

function readKey(id: string): string {
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("k");
  try {
    if (fromLink) localStorage.setItem(KEY(id), fromLink);
    return fromLink ?? localStorage.getItem(KEY(id)) ?? "";
  } catch {
    return fromLink ?? "";
  }
}

const dayOf = (b: Booking) => b.label.split(",")[0];
const timeOf = (b: Booking) => b.label.split(", ").slice(1).join(", ");
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Everything a business needs for bookings, on one page that works on a
 * phone: upcoming bookings, blocking time off, opening hours, and a calendar
 * link. No inbox and nothing to approve: bookings are instant.
 */
export function OwnerPage({ id }: { id: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [hours, setHours] = useState<BookingSettings | null>(null);
  const [block, setBlock] = useState({ date: "", allDay: true, from: "12:00", to: "13:00", note: "" });
  const key = useRef("");

  const call = useCallback(
    async (method: "GET" | "POST", body?: unknown) => {
      const res = await fetch(`/api/owner/${id}`, {
        method,
        cache: "no-store",
        headers: { "content-type": "application/json", ...(key.current ? { "x-owner-key": key.current } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
      return data;
    },
    [id],
  );

  const load = useCallback(async () => {
    try {
      const data = (await call("GET")) as View;
      setView((v) => ({ ...data, ownerUrl: data.ownerUrl ?? v?.ownerUrl }));
      setHours((h) => h ?? data.settings);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [call]);

  useEffect(() => {
    key.current = readKey(id);
    // Keep the key out of the address bar (and screenshots) once it's saved.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlock((b) => ({ ...b, date: today() }));
    load();
    // New bookings show up without reloading.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [id, load]);

  const act = async (label: string, body: Record<string, unknown>, done?: string) => {
    setBusy(label);
    setNotice("");
    try {
      const data = await call("POST", body);
      if (body.action === "reset-link") setView((v) => v && { ...v, ownerUrl: data.ownerUrl });
      else setView((v) => v && { ...v, ...data });
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  };

  if (!view)
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center p-6 text-center">
        {error ? (
          <div>
            <CalendarOff className="mx-auto h-8 w-8 text-muted" />
            <h1 className="mt-3 text-lg font-semibold">Can&apos;t open bookings</h1>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading bookings" />
        )}
      </main>
    );

  const groups: [string, Booking[]][] = [];
  for (const b of view.bookings) {
    const day = dayOf(b);
    const g = groups.find(([d]) => d === day);
    if (g) g[1].push(b);
    else groups.push([day, [b]]);
  }
  const webcal = view.calendarUrl.replace(/^https?:/, "webcal:");

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Bookings</p>
          <h1 className="text-2xl font-bold">{view.name || "Your app"}</h1>
        </div>
        <button
          onClick={() => load()}
          aria-label="Refresh bookings"
          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {notice && (
        <p role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      <section className={box} aria-labelledby="upcoming">
        <h2 id="upcoming" className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4 text-violet-300" /> Upcoming bookings
        </h2>
        {groups.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No bookings yet. They appear here the moment a customer books in the app.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {groups.map(([day, list]) => (
              <div key={day}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{day}</h3>
                <ul className="space-y-2">
                  {list.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2/60 p-3">
                      <div className="w-20 shrink-0 text-sm font-semibold">
                        <Clock className="mr-1 inline h-3.5 w-3.5 text-muted" />
                        {timeOf(b)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {b.name}
                          {b.isNew && <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">New</span>}
                        </p>
                        <p className="truncate text-xs text-muted">{[b.service, b.phone, b.note].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="flex gap-1">
                        <a
                          href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}
                          aria-label={`Call ${b.name}`}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-line text-muted hover:text-foreground"
                        >
                          <Phone className="h-4 w-4" />
                        </a>
                        <a
                          href={`https://wa.me/${b.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp ${b.name}`}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-line text-muted hover:text-foreground"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => setCancelling(b)}
                          aria-label={`Cancel ${b.name}'s booking`}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-line text-muted hover:border-rose-500/40 hover:text-rose-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={box} aria-labelledby="block">
        <h2 id="block" className="flex items-center gap-2 font-semibold">
          <CalendarOff className="h-4 w-4 text-violet-300" /> Block time
        </h2>
        <p className="mt-1 text-sm text-muted">Holidays, lunch, or a booking you took by phone: blocked time isn&apos;t offered in the app.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted">
            Day
            <input type="date" value={block.date} min={today()} onChange={(e) => setBlock({ ...block, date: e.target.value })} className={field} />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={block.allDay} onChange={(e) => setBlock({ ...block, allDay: e.target.checked })} className="h-4 w-4 accent-violet-500" />
            All day
          </label>
          {!block.allDay && (
            <>
              <label className="grid gap-1 text-xs text-muted">
                From
                <input type="time" step={900} value={block.from} onChange={(e) => setBlock({ ...block, from: e.target.value })} className={field} />
              </label>
              <label className="grid gap-1 text-xs text-muted">
                To
                <input type="time" step={900} value={block.to} onChange={(e) => setBlock({ ...block, to: e.target.value })} className={field} />
              </label>
            </>
          )}
          <button
            onClick={async () => {
              const ok = await act(
                "block",
                { action: "block", date: block.date, ...(block.allDay ? {} : { from: block.from, to: block.to }) },
                "Blocked. Customers won't see those times.",
              );
              if (ok) setBlock((b) => ({ ...b, note: "" }));
            }}
            disabled={!block.date || !!busy}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50"
          >
            {busy === "block" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarOff className="h-4 w-4" />} Block
          </button>
        </div>
        {view.blocks.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {view.blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-1.5 text-sm">
                {b.label}
                <button
                  onClick={() => act("unblock", { action: "unblock", id: b.id }, "Unblocked. Those times are free again.")}
                  aria-label={`Unblock ${b.label}`}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hours && (
        <section className={box} aria-labelledby="hours">
          <h2 id="hours" className="mb-3 flex items-center gap-2 font-semibold">
            <Clock className="h-4 w-4 text-violet-300" /> Hours and appointments
          </h2>
          <HoursEditor value={hours} onChange={setHours} />
          <button
            onClick={() => act("settings", { action: "settings", settings: hours }, "Saved. The app shows the new times straight away.")}
            disabled={!!busy}
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50"
          >
            {busy === "settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save hours
          </button>
        </section>
      )}

      <section className={box} aria-labelledby="calendar">
        <h2 id="calendar" className="flex items-center gap-2 font-semibold">
          <CalendarPlus className="h-4 w-4 text-violet-300" /> See bookings in your phone&apos;s calendar
        </h2>
        <p className="mt-1 text-sm text-muted">Optional. Bookings then show up in your calendar with the customer&apos;s name and phone number.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={webcal} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20">
            <CalendarPlus className="h-4 w-4" /> iPhone / Apple Calendar
          </a>
          <a
            href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20"
          >
            <CalendarPlus className="h-4 w-4" /> Google Calendar
          </a>
        </div>
        <p className="mt-2 text-xs text-muted">Apple Calendar checks for new bookings every 15 minutes; Google Calendar can take several hours. This page is always up to date.</p>
      </section>

      {view.ownerUrl && (
        <section className={box} aria-labelledby="share">
          <h2 id="share" className="font-semibold">
            Owner link for the business
          </h2>
          <p className="mt-1 text-sm text-muted">Send this link to whoever runs the bookings. It opens this page without an account; keep it private.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => navigator.clipboard?.writeText(view.ownerUrl!).then(() => setNotice("Owner link copied."))}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black"
            >
              <Copy className="h-4 w-4" /> Copy owner link
            </button>
            <button
              onClick={() => act("reset-link", { action: "reset-link" }, "New owner link made. The old one no longer works.")}
              disabled={!!busy}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" /> Make a new link
            </button>
          </div>
        </section>
      )}

      <p className="px-1 text-center text-xs text-muted">Tip: add this page to your home screen to open it like an app. Bookings older than a year are deleted automatically.</p>

      {cancelling && (
        <ConfirmDialog
          title={`Cancel ${cancelling.name}'s booking?`}
          body={
            <>
              {cancelling.label}
              {cancelling.service ? ` · ${cancelling.service}` : ""}. The time becomes free in the app. Let {cancelling.name} know on {cancelling.phone}.
            </>
          }
          confirmLabel="Cancel booking"
          danger
          onCancel={() => setCancelling(null)}
          onConfirm={async () => {
            await act("cancel", { action: "cancel", id: cancelling.id }, "Booking cancelled. The time is free again.");
            setCancelling(null);
          }}
        />
      )}
    </main>
  );
}
